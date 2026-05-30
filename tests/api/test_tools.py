from api.tools import TOOL_SCHEMAS, run_tool


class _Store:
    def vector_search(self, emb, k, max_sensitivity):
        return [{"chunk_id": "c1", "text": "note", "score": 0.9,
                 "doc_id": "d1", "title": "ESMA", "sensitivity": "C2 Internal"}]

    def run(self, cypher, **p):
        return [{"entities": ["MiFID II"], "insights": []}]

    def touched_subgraph(self, chunk_ids):
        return {"nodes": [{"id": "Chunk:c1", "label": "Chunk"}], "edges": []}

    def neighborhood(self, name, limit=25):
        return {"nodes": [{"id": "Regulation:MiFID II", "label": "Regulation"}], "edges": []}


class _Emb:
    def embed(self, texts):
        return [[0.0, 0.1, 0.2]]


def test_tool_schemas_shape():
    names = {t["name"] for t in TOOL_SCHEMAS}
    assert names == {"search_knowledge", "expand_graph", "lookup_backbone"}
    for t in TOOL_SCHEMAS:
        assert "input_schema" in t and t["input_schema"]["type"] == "object"


def test_search_knowledge_returns_triple_with_citations_and_delta():
    model_result, delta, citations = run_tool(
        "search_knowledge", {"query": "structured note"},
        store=_Store(), embedder=_Emb(), max_sensitivity="C2 Internal",
    )
    assert "ESMA" in model_result
    assert delta["nodes"][0]["id"] == "Chunk:c1"
    assert citations[0]["sensitivity"] == "C2 Internal"
    assert citations[0]["chunk_id"] == "c1"


def test_expand_graph_returns_neighborhood_delta():
    model_result, delta, citations = run_tool(
        "expand_graph", {"entity": "MiFID II"},
        store=_Store(), embedder=_Emb(), max_sensitivity="C2 Internal",
    )
    assert delta["nodes"][0]["id"] == "Regulation:MiFID II"
    assert citations == []
