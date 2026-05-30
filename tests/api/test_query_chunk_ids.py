from company_brain.query import query


class _FakeEmbedder:
    def embed(self, texts):
        return [[0.0, 0.1, 0.2]]


class _FakeStore:
    def vector_search(self, emb, k, max_sensitivity):
        return [{
            "chunk_id": "c1", "text": "structured note text", "score": 0.9,
            "doc_id": "d1", "title": "ESMA 2015-1787", "sensitivity": "C2 Internal",
        }]

    def run(self, cypher, **params):
        return [{"entities": ["MiFID II"], "insights": []}]


def test_query_exposes_chunk_id_and_doc_id():
    out = query("is a structured note complex?", store=_FakeStore(), embedder=_FakeEmbedder())
    assert out["citations"][0]["chunk_id"] == "c1"
    assert out["citations"][0]["doc_id"] == "d1"
    assert out["context"][0]["chunk_id"] == "c1"
