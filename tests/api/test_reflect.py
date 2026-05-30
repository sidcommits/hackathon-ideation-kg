import pytest

from api.reflect import distill_truths, ingest_truths


# ── distill_truths fakes ─────────────────────────────────────────────────────
class _Block:
    def __init__(self, text):
        self.type = "text"
        self.text = text


class _Msg:
    def __init__(self, text):
        self.content = [_Block(text)]


class _FakeMessages:
    def __init__(self, text):
        self.text = text
        self.calls = []

    async def create(self, **kw):
        self.calls.append(kw)
        return _Msg(self.text)


class _FakeClient:
    def __init__(self, text):
        self.messages = _FakeMessages(text)


_GOOD = """```json
{"summary": "Covered ESG notes.",
 "truths": [{"question": "Is an ESG-linked note reportable?",
             "answer": "Yes, under MiFIR.",
             "entities": ["MiFIR", "ESG-linked note"]}]}
```"""


@pytest.mark.asyncio
async def test_distill_parses_fenced_json():
    client = _FakeClient(_GOOD)
    out = await distill_truths(
        [{"role": "user", "content": "Is an ESG note reportable?"},
         {"role": "assistant", "content": "Yes, under MiFIR."}],
        client=client, model="claude-x",
    )
    assert out["summary"] == "Covered ESG notes."
    assert len(out["truths"]) == 1
    assert out["truths"][0]["question"].startswith("Is an ESG")
    assert out["truths"][0]["entities"] == ["MiFIR", "ESG-linked note"]
    sent = client.messages.calls[0]["messages"][0]["content"]
    assert "ESG note" in sent


@pytest.mark.asyncio
async def test_distill_malformed_returns_empty():
    client = _FakeClient("sorry, I cannot do that")
    out = await distill_truths([{"role": "user", "content": "hi"}],
                               client=client, model="claude-x")
    assert out == {"summary": "", "truths": []}


@pytest.mark.asyncio
async def test_distill_drops_malformed_truth_entries():
    client = _FakeClient(
        '{"summary":"s","truths":[{"question":"q","answer":"a","entities":["X"]},'
        '{"question":"","answer":"a"},"junk",{"answer":"only"}]}'
    )
    out = await distill_truths([{"role": "user", "content": "hi"}],
                               client=client, model="claude-x")
    assert out["truths"] == [{"question": "q", "answer": "a", "entities": ["X"]}]


# ── ingest_truths fakes ──────────────────────────────────────────────────────
class _FakeStore:
    def __init__(self):
        self.docs = []
        self.chunks = []
        self.cyphers = []

    def upsert_document(self, doc):
        self.docs.append(doc)

    def upsert_chunk(self, chunk):
        self.chunks.append(chunk)

    def run(self, cypher, **params):
        self.cyphers.append((cypher, params))
        return []


class _FakeEmbedder:
    def __init__(self):
        self.calls = []

    def embed(self, texts):
        self.calls.append(texts)
        return [[0.1, 0.2, 0.3] for _ in texts]


def test_ingest_writes_conversation_document_and_chunks():
    store, emb = _FakeStore(), _FakeEmbedder()
    truths = [
        {"question": "Is an ESG note reportable?", "answer": "Yes, under MiFIR.",
         "entities": ["MiFIR"]},
        {"question": "Is it complex?", "answer": "Yes.", "entities": []},
    ]
    counts = ingest_truths(truths, store=store, embedder=emb,
                           sensitivity="C2 Internal", session_id="s1")

    assert len(store.docs) == 1
    doc = store.docs[0]
    assert doc.source_type == "conversation"
    assert doc.sensitivity == "C2 Internal"
    assert doc.doc_id == "conversation:s1"
    assert len(store.chunks) == 2
    assert store.chunks[0].embedding == [0.1, 0.2, 0.3]
    assert store.chunks[0].doc_id == "conversation:s1"
    assert counts == {"doc_id": "conversation:s1", "chunks_written": 2,
                      "insights_written": 2, "entities_linked": 1}


def test_ingest_links_only_existing_entities_and_never_creates_them():
    store, emb = _FakeStore(), _FakeEmbedder()
    ingest_truths([{"question": "q", "answer": "a", "entities": ["MiFIR"]}],
                  store=store, embedder=emb, sensitivity="C2 Internal", session_id="s1")
    joined = "\n".join(c for c, _ in store.cyphers)
    assert "MERGE (i)-[:ABOUT]->(n)" in joined
    assert "MERGE (n:" not in joined and "MERGE (n " not in joined
    assert "d.learned" in joined
    assert "DELETE" not in joined.upper()


def test_ingest_tags_document_learned_with_session_and_timestamp():
    store, emb = _FakeStore(), _FakeEmbedder()
    ingest_truths([{"question": "q", "answer": "a", "entities": []}],
                  store=store, embedder=emb, sensitivity="Confidential", session_id="abc")
    doc_set = next(c for c, p in store.cyphers if "d.learned" in c)
    params = next(p for c, p in store.cyphers if "d.learned" in c)
    assert params["sid"] == "abc"
    assert "ingested_at" in doc_set and "session_id" in doc_set


def test_ingest_empty_truths_writes_nothing():
    store, emb = _FakeStore(), _FakeEmbedder()
    counts = ingest_truths([], store=store, embedder=emb,
                           sensitivity="C2 Internal", session_id="s1")
    assert store.docs == [] and store.chunks == [] and store.cyphers == []
    assert counts == {"doc_id": "conversation:s1", "chunks_written": 0,
                      "insights_written": 0, "entities_linked": 0}
