"""End-to-end backend proof for the voice→web-chat MIRROR feature.

Chain under test:
  POST /v1/chat/completions
    → background asyncio.create_task(_drive()) runs run_agent(mode="voice")
    → accumulates the turn
    → active_call.broadcast(MirrorTurn) → EVERY subscribed SSE connection's queue
    → GET /api/calls/{call_id}/events (SSE) yields it
    → web EventSource → reduce() appends bubbles.

NO Neo4j. NO real LLM. run_agent is monkeypatched with a fake async generator.
Each consumer subscribes its OWN queue (fan-out), so a test must subscribe BEFORE
the POST to capture the broadcast — exactly like a live SSE connection.
"""
import json

import api.deps as deps
import api.main as main
from api.main import app
from fastapi.testclient import TestClient

CALL_ID = "hackathon-call-id"


def _global_call():
    return deps.ACTIVE_CALLS[CALL_ID]


def _drain(q):
    out = []
    while not q.empty():
        out.append(q.get_nowait())
    return out


def _reset():
    """Isolate from other tests: drop subscribers + clear in-flight dedup."""
    _global_call().subscribers.clear()
    _global_call().inflight_questions.clear()


def _fake_voice_agent(spoken="SPOKEN_SUMMARY ", detail="DETAIL_BODY", doc="ESMA"):
    from api.events import (
        MessageStart, Token, ToolResult, Citation, MessageEnd,
    )

    async def fake_agent(messages, *, mode="text", **kw):
        assert mode == "voice", "the /v1 endpoint must drive run_agent in voice mode"
        yield MessageStart(id="m")
        yield ToolResult(id="call_search_knowledge", summary="ok",
                         graph_delta={"nodes": [{"id": "Reg:MiFID", "label": "Regulation"}],
                                      "edges": []})
        yield Token(text=spoken, channel="spoken")
        yield Token(text=detail, channel="detail")
        yield Citation(doc_title=doc, sensitivity="C2 Internal", chunk_text="x")
        yield MessageEnd(stop_reason="end_turn")

    return fake_agent


# ── broadcast + background-task completion ───────────────────────────────────
def test_mirror_broadcast_to_subscriber_after_post_nonstreaming(monkeypatch):
    monkeypatch.setattr(main, "run_agent", _fake_voice_agent())
    _reset()
    q = _global_call().subscribe()                 # a live SSE consumer subscribes first

    client = TestClient(app)
    resp = client.post("/v1/chat/completions", json={
        "messages": [{"role": "user", "content": "Is the structured note covered?"}],
        "stream": False,
    })
    assert resp.status_code == 200
    assert resp.json()["choices"][0]["message"]["content"].startswith("SPOKEN_SUMMARY")

    turns = [e for e in _drain(q) if e.type == "mirror_turn"]
    assert len(turns) == 1
    t = turns[0]
    assert t.question == "Is the structured note covered?"
    assert t.answer == "DETAIL_BODY"               # full detail, NOT the spoken summary
    assert t.citations[0]["doc_title"] == "ESMA"
    assert any(n["id"] == "Reg:MiFID" for n in t.graph_delta["nodes"])


def test_mirror_broadcast_to_subscriber_after_post_streaming(monkeypatch):
    monkeypatch.setattr(main, "run_agent", _fake_voice_agent())
    _reset()
    q = _global_call().subscribe()

    client = TestClient(app)
    resp = client.post("/v1/chat/completions", json={
        "messages": [{"role": "user", "content": "stream question"}],
        "stream": True,
    })
    assert resp.status_code == 200
    assert resp.text.rstrip().endswith("[DONE]")

    turns = [e for e in _drain(q) if e.type == "mirror_turn"]
    assert len(turns) == 1 and turns[0].answer == "DETAIL_BODY"


def test_two_subscribers_both_receive_the_mirror(monkeypatch):
    """The fan-out fix: with TWO connected consumers, BOTH get the MirrorTurn —
    neither steals it from the other (the live bug was one shared queue)."""
    monkeypatch.setattr(main, "run_agent", _fake_voice_agent())
    _reset()
    q1 = _global_call().subscribe()
    q2 = _global_call().subscribe()

    TestClient(app).post("/v1/chat/completions", json={
        "messages": [{"role": "user", "content": "broadcast to all"}], "stream": False,
    })
    assert [e for e in _drain(q1) if e.type == "mirror_turn"]
    assert [e for e in _drain(q2) if e.type == "mirror_turn"]


# ── SSE wire delivery ────────────────────────────────────────────────────────
def test_mirror_arrives_over_events_sse_wire():
    """Drive the real /events endpoint coroutine + its SSE body generator directly:
    subscribe via call_events, broadcast a MirrorTurn, pull ONE frame off the wire.
    Times out (fails fast) rather than hanging if delivery is broken."""
    import asyncio
    from api.events import MirrorTurn

    async def run():
        _reset()
        resp = await main.call_events(call_id=CALL_ID)   # subscribes its own queue
        assert resp.media_type == "text/event-stream"
        _global_call().broadcast(MirrorTurn(
            question="wire question", answer="DETAIL_BODY",
            citations=[{"doc_title": "ESMA", "sensitivity": "C2 Internal", "chunk_text": "x"}],
            graph_delta={"nodes": [{"id": "Reg:MiFID", "label": "Regulation"}], "edges": []},
        ))
        body_iter = resp.body_iterator
        try:
            for _ in range(3):                            # tolerate a leading keepalive
                raw = await asyncio.wait_for(body_iter.__anext__(), timeout=5)
                payload = raw["data"] if isinstance(raw, dict) else (
                    raw.decode() if isinstance(raw, (bytes, bytearray)) else str(raw))
                if "mirror_turn" in payload:
                    frame = json.loads(payload if payload.strip().startswith("{")
                                       else next(l for l in payload.splitlines()
                                                 if l.startswith("data:"))[5:].strip())
                    return frame
        finally:
            await body_iter.aclose()
        return None

    frame = asyncio.run(run())
    assert frame and frame["type"] == "mirror_turn"
    assert frame["question"] == "wire question" and frame["answer"] == "DETAIL_BODY"
    assert "nodes" in frame["graph_delta"] and "edges" in frame["graph_delta"]


# ── dedup ────────────────────────────────────────────────────────────────────
def test_same_question_twice_in_sequence_mirrors_both_times(monkeypatch):
    monkeypatch.setattr(main, "run_agent", _fake_voice_agent())
    _reset()
    q = _global_call().subscribe()
    client = TestClient(app)
    payload = {"messages": [{"role": "user", "content": "repeat me"}], "stream": False}

    client.post("/v1/chat/completions", json=payload)
    assert len([e for e in _drain(q) if e.type == "mirror_turn"]) == 1

    client.post("/v1/chat/completions", json=payload)        # re-ask must mirror again
    second = [e for e in _drain(q) if e.type == "mirror_turn"]
    assert len(second) == 1 and second[0].question == "repeat me"


def test_concurrent_duplicate_is_suppressed(monkeypatch):
    monkeypatch.setattr(main, "run_agent", _fake_voice_agent())
    _reset()
    call = _global_call()
    q = call.subscribe()
    call.inflight_questions.add("dup")               # pretend the first turn is mid-flight
    TestClient(app).post("/v1/chat/completions", json={
        "messages": [{"role": "user", "content": "dup"}], "stream": False,
    })
    assert [e for e in _drain(q) if e.type == "mirror_turn"] == []
