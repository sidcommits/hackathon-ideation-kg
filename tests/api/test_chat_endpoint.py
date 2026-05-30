import json

from fastapi.testclient import TestClient

import api.main as main
from api.main import app


def _parse_sse(body: str):
    events = []
    for line in body.splitlines():
        if line.startswith("data: "):
            events.append(json.loads(line[len("data: "):]))
    return events


def test_chat_streams_event_sequence(monkeypatch):
    from api.events import MessageStart, Token, ToolResult, Citation, MessageEnd

    async def fake_agent(messages, **kw):
        yield MessageStart(id="m")
        yield Token(text="hi")
        yield ToolResult(id="tc_1", summary="ok",
                         graph_delta={"nodes": [{"id": "Chunk:c1", "label": "Chunk"}], "edges": []})
        yield Citation(doc_title="ESMA", sensitivity="C2 Internal", chunk_text="...")
        yield MessageEnd(stop_reason="end_turn")

    monkeypatch.setattr(main, "run_agent", fake_agent)

    client = TestClient(app)
    resp = client.post("/chat", json={"messages": [{"role": "user", "content": "hello"}]})
    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    assert events[0]["type"] == "message_start"
    assert events[-1]["type"] == "message_end"
    assert any(e["type"] == "tool_result" for e in events)


def test_chat_forwards_max_sensitivity(monkeypatch):
    """Endpoint forwarding: the endpoint passes max_sensitivity through to the agent and
    streams only the citations the agent yields. This does NOT prove end-to-end
    server-side enforcement (the fake agent reimplements the filter); real enforcement
    is covered by tests/api/test_access_control.py against GraphStore.vector_search."""
    from api.events import MessageStart, Citation, MessageEnd

    async def fake_agent(messages, *, max_sensitivity, **kw):
        yield MessageStart(id="m")
        all_cites = [
            Citation(doc_title="Public", sensitivity="C2 Internal", chunk_text="ok"),
            Citation(doc_title="Master Data", sensitivity="Confidential", chunk_text="secret"),
        ]
        rank = {"C2 Internal": 1, "Confidential": 2}
        for c in all_cites:
            if rank[c.sensitivity] <= rank[max_sensitivity]:
                yield c
        yield MessageEnd(stop_reason="end_turn")

    monkeypatch.setattr(main, "run_agent", fake_agent)

    client = TestClient(app)
    resp = client.post("/chat", json={
        "messages": [{"role": "user", "content": "show me master data process"}],
        "max_sensitivity": "C2 Internal",
    })
    events = _parse_sse(resp.text)
    sensitivities = {e["sensitivity"] for e in events if e["type"] == "citation"}
    assert "Confidential" not in sensitivities
    assert sensitivities == {"C2 Internal"}


def test_v1_chat_completions_streaming(monkeypatch):
    from api.events import MessageStart, Token, MessageEnd

    async def fake_agent(messages, **kw):
        yield MessageStart(id="m")
        yield Token(text="hello ")
        yield Token(text="there")
        yield MessageEnd(stop_reason="end_turn")

    monkeypatch.setattr(main, "run_agent", fake_agent)

    client = TestClient(app)
    resp = client.post("/v1/chat/completions", json={
        "messages": [{"role": "system", "content": "you are a helper"},
                     {"role": "user", "content": "hi"}],
        "stream": True
    })
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]

    chunks = [json.loads(l[len("data: "):]) for l in resp.text.splitlines()
              if l.startswith("data: ") and not l.endswith("[DONE]")]
    deltas = [c["choices"][0]["delta"] for c in chunks]
    # Beyond Presence needs the canonical OpenAI sequence or the avatar freezes:
    assert deltas[0].get("role") == "assistant"                 # 1) role opener
    body = "".join(d.get("content", "") for d in deltas)
    assert body == "hello there"                                # 2) content
    assert chunks[-1]["choices"][0]["finish_reason"] == "stop"  # 3) terminal stop
    assert resp.text.rstrip().endswith("[DONE]")                # 4) [DONE] last
    assert len({c["id"] for c in chunks}) == 1                  # one shared id


def test_v1_chat_completions_non_streaming_returns_json(monkeypatch):
    """When BP requests stream:false it expects ONE plain-JSON chat.completion
    body (not SSE). Returning SSE here froze the avatar."""
    from api.events import MessageStart, Token, MessageEnd

    async def fake_agent(messages, **kw):
        yield MessageStart(id="m")
        yield Token(text="hello ")
        yield Token(text="there")
        yield MessageEnd(stop_reason="end_turn")

    monkeypatch.setattr(main, "run_agent", fake_agent)

    client = TestClient(app)
    resp = client.post("/v1/chat/completions", json={
        "messages": [{"role": "user", "content": "hi"}],
        "stream": False
    })
    assert resp.status_code == 200
    assert "application/json" in resp.headers["content-type"]
    data = resp.json()
    assert data["object"] == "chat.completion"
    assert data["choices"][0]["message"]["role"] == "assistant"
    assert data["choices"][0]["message"]["content"] == "hello there"
    assert data["choices"][0]["finish_reason"] == "stop"


def _drain_global_queue():
    import api.deps as deps
    q = deps.ACTIVE_CALLS["hackathon-call-id"].event_queue
    out = []
    while not q.empty():
        out.append(q.get_nowait())
    return out


def test_v1_speaks_summary_and_mirrors_full_turn_atomically(monkeypatch):
    import api.deps as deps
    from api.events import MessageStart, Token, Citation, MessageEnd

    async def fake_agent(messages, *, mode="text", **kw):
        assert mode == "voice"                       # endpoint must request voice
        yield MessageStart(id="m")
        yield Token(text="SPOKEN_SUMMARY ", channel="spoken")
        yield Token(text="DETAIL_BODY", channel="detail")
        yield Citation(doc_title="ESMA", sensitivity="C2 Internal", chunk_text="x")
        yield MessageEnd(stop_reason="end_turn")

    monkeypatch.setattr(main, "run_agent", fake_agent)
    _drain_global_queue()                            # isolate from prior tests
    deps.ACTIVE_CALLS["hackathon-call-id"].inflight_questions.clear()

    client = TestClient(app)
    resp = client.post("/v1/chat/completions", json={
        "messages": [{"role": "user", "content": "Is the note covered?"}],
        "stream": True,
    })
    assert resp.status_code == 200
    chunks = [json.loads(l[len("data: "):]) for l in resp.text.splitlines()
              if l.startswith("data: ") and not l.endswith("[DONE]")]
    body = "".join(c["choices"][0]["delta"].get("content", "") for c in chunks)
    assert "SPOKEN_SUMMARY" in body                  # avatar speaks the summary
    assert "DETAIL_BODY" not in body                 # full answer NOT spoken

    drained = _drain_global_queue()
    # Exactly ONE atomic mirror event carries the whole turn — no token stream.
    turns = [e for e in drained if e.type == "mirror_turn"]
    assert len(turns) == 1
    turn = turns[0]
    assert turn.question == "Is the note covered?"
    assert turn.answer == "DETAIL_BODY"
    assert turn.citations[0]["doc_title"] == "ESMA"
    assert all(e.type not in {"token", "message_start", "message_end"} for e in drained)


def test_v1_suppresses_concurrent_duplicate_but_allows_reask(monkeypatch):
    import api.deps as deps
    from api.events import Token, MessageEnd

    async def fake_agent(messages, *, mode="text", **kw):
        yield Token(text="hi ", channel="spoken")
        yield Token(text="answer", channel="detail")
        yield MessageEnd(stop_reason="end_turn")

    monkeypatch.setattr(main, "run_agent", fake_agent)
    call = deps.ACTIVE_CALLS["hackathon-call-id"]
    _drain_global_queue()
    call.inflight_questions.clear()

    client = TestClient(app)
    payload = {"messages": [{"role": "user", "content": "dup question"}], "stream": True}

    # A concurrent duplicate (same question still in-flight) is suppressed.
    call.inflight_questions.add("dup question")          # simulate the first call in-flight
    client.post("/v1/chat/completions", json=payload)
    assert [e for e in _drain_global_queue() if e.type == "mirror_turn"] == []

    # A later re-ask (nothing in-flight) DOES mirror — re-asking is not blocked.
    call.inflight_questions.clear()
    client.post("/v1/chat/completions", json=payload)
    turns = [e for e in _drain_global_queue() if e.type == "mirror_turn"]
    assert len(turns) == 1 and turns[0].question == "dup question"


def test_v1_chat_completions_failure_does_not_freeze(monkeypatch):
    """If the agent pipeline raises, the endpoint must still emit a valid OpenAI
    content chunk AND terminate with [DONE] — never a bare {"error"} with no
    terminator, which leaves Beyond Presence's avatar frozen."""
    async def boom_agent(messages, **kw):
        yield  # make this an async generator
        raise RuntimeError("vector index chunk_vec not found")

    monkeypatch.setattr(main, "run_agent", boom_agent)

    client = TestClient(app)
    resp = client.post("/v1/chat/completions", json={
        "messages": [{"role": "user", "content": "What is MiFID II?"}],
        "stream": True,
    })
    assert resp.status_code == 200
    assert "[DONE]" in resp.text  # stream is terminated → avatar never freezes
    chunks = [json.loads(l[len("data: "):]) for l in resp.text.splitlines()
              if l.startswith("data: ") and not l.endswith("[DONE]")]
    assert chunks and "choices" in chunks[-1]
    spoken = "".join(c["choices"][0]["delta"].get("content", "") for c in chunks)
    assert "Sorry" in spoken
    # Even on failure the turn must be properly closed for BP.
    assert chunks[-1]["choices"][0]["finish_reason"] == "stop"
