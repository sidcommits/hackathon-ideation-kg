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
