from company_brain.graph import GraphStore


def _store_with_run(rows):
    store = GraphStore.__new__(GraphStore)  # bypass __init__/driver
    store.run = lambda cypher, **params: rows
    return store


def test_touched_subgraph_builds_nodes_and_edges():
    rows = [{
        "chunk_id": "c1", "doc_id": "d1", "doc_title": "ESMA",
        "entities": [{"label": "Regulation", "name": "MiFID II"}],
    }]
    store = _store_with_run(rows)
    g = store.touched_subgraph(["c1"])
    ids = {n["id"] for n in g["nodes"]}
    assert "Chunk:c1" in ids and "Document:d1" in ids and "Regulation:MiFID II" in ids
    assert {"from": "Regulation:MiFID II", "to": "Chunk:c1", "rel": "MENTIONED_IN"} in g["edges"]


def test_neighborhood_builds_edges_from_rows():
    rows = [{
        "src": {"label": "Regulation", "name": "MiFID II"},
        "rel": "REQUIRES",
        "dst": {"label": "DataAttribute", "name": "Complex"},
    }]
    store = _store_with_run(rows)
    g = store.neighborhood("MiFID II")
    assert {"id": "Regulation:MiFID II", "label": "Regulation", "name": "MiFID II"} in g["nodes"]
    assert {"from": "Regulation:MiFID II", "to": "DataAttribute:Complex", "rel": "REQUIRES"} in g["edges"]
