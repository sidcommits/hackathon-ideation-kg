from company_brain.graph import GraphStore


def _capturing_store():
    """A GraphStore whose .run captures the params it was called with (no real driver)."""
    captured = {}
    store = GraphStore.__new__(GraphStore)  # bypass __init__/driver
    store.run = lambda cypher, **params: captured.update(params) or []
    return store, captured


def test_vector_search_excludes_confidential_at_c2_internal():
    store, captured = _capturing_store()
    store.vector_search([0.1, 0.2, 0.3], k=5, max_sensitivity="C2 Internal")
    assert "Confidential" not in captured["allowed"]
    assert "C2 Internal" in captured["allowed"]


def test_vector_search_allows_confidential_at_confidential():
    store, captured = _capturing_store()
    store.vector_search([0.1, 0.2, 0.3], k=5, max_sensitivity="Confidential")
    assert "Confidential" in captured["allowed"]
    assert "C2 Internal" in captured["allowed"]
