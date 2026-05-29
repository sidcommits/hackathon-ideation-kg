import pytest
from tests.conftest import requires_neo4j
from company_brain.config import get_settings
from company_brain.graph import GraphStore
from company_brain.model import Document, Chunk
from company_brain.query import query


@pytest.fixture
def store():
    s = get_settings()
    gs = GraphStore(s.neo4j_uri, s.neo4j_user, s.neo4j_password)
    gs.run("MATCH (n) DETACH DELETE n")
    gs.ensure_schema(embedding_dim=8)
    yield gs
    gs.close()


@requires_neo4j
def test_query_returns_context_with_citations(store, fake_embedder):
    store.upsert_document(Document(doc_id="d1", source_path="p", source_type="pdf",
                                   title="MiFID Note", domain="mifid", sensitivity="C2 Internal"))
    emb = fake_embedder()
    vec = emb.embed(["structured notes coverage depends on classification"])[0]
    store.upsert_chunk(Chunk(chunk_id="d1::0", doc_id="d1",
                             text="structured notes coverage depends on classification",
                             ordinal=0, embedding=vec))
    out = query("are structured notes covered?", store=store, embedder=emb, k=3)
    assert out["context"]
    assert out["citations"][0]["doc_title"] == "MiFID Note"
    assert out["citations"][0]["sensitivity"] == "C2 Internal"
    assert "chunk_text" in out["citations"][0]
