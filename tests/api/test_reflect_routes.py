from fastapi.testclient import TestClient

import api.reflect_routes as rr
from api.main import app


def test_reflect_endpoint_returns_truths(monkeypatch):
    async def fake_distill(messages, *, client, model):
        assert messages and messages[0]["content"] == "hi"
        return {"summary": "s", "truths": [{"question": "q", "answer": "a", "entities": []}]}

    monkeypatch.setattr(rr, "distill_truths", fake_distill)
    client = TestClient(app)
    resp = client.post("/reflect", json={"messages": [{"role": "user", "content": "hi"}]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["truths"][0]["question"] == "q"


def test_ingest_endpoint_forwards_truths_and_sensitivity(monkeypatch):
    seen = {}

    def fake_ingest(truths, *, store, embedder, sensitivity, session_id):
        seen.update(truths=truths, sensitivity=sensitivity, session_id=session_id)
        return {"doc_id": f"conversation:{session_id}", "chunks_written": len(truths),
                "insights_written": len(truths), "entities_linked": 0}

    monkeypatch.setattr(rr, "ingest_truths", fake_ingest)
    client = TestClient(app)
    resp = client.post("/learnings/ingest", json={
        "truths": [{"question": "q", "answer": "a", "entities": []}],
        "max_sensitivity": "Confidential",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True and data["chunks_written"] == 1
    assert seen["sensitivity"] == "Confidential"
    assert seen["truths"][0]["answer"] == "a"
    assert seen["session_id"]  # auto-generated when not supplied
