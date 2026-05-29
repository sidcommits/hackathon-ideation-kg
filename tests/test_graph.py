import pytest
from tests.conftest import requires_neo4j
from company_brain.config import get_settings
from company_brain.graph import GraphStore
from company_brain.model import Document, Chunk


@pytest.fixture
def store():
    s = get_settings()
    gs = GraphStore(s.neo4j_uri, s.neo4j_user, s.neo4j_password)
    gs.run("MATCH (n) DETACH DELETE n")     # clean slate
    gs.ensure_schema(embedding_dim=8)
    yield gs
    gs.close()


@requires_neo4j
def test_upsert_document_and_chunk_idempotent(store):
    doc = Document(doc_id="d1", source_path="/x.pdf", source_type="pdf",
                   title="x.pdf", domain="mifid", sensitivity="C2 Internal")
    store.upsert_document(doc)
    store.upsert_document(doc)  # second call must not duplicate
    c = Chunk(chunk_id="d1::0", doc_id="d1", text="hello", ordinal=0, embedding=[0.0] * 8)
    store.upsert_chunk(c)
    n = store.run("MATCH (d:Document) RETURN count(d) AS c")[0]["c"]
    assert n == 1
    linked = store.run(
        "MATCH (:Chunk {chunk_id:'d1::0'})-[:PART_OF]->(d:Document {doc_id:'d1'}) RETURN count(*) AS c"
    )[0]["c"]
    assert linked == 1


@requires_neo4j
def test_vector_search_respects_sensitivity(store):
    for did, sens in [("pub", "C2 Internal"), ("sec", "Confidential")]:
        store.upsert_document(Document(doc_id=did, source_path="p", source_type="pdf",
                                       title=did, domain="g", sensitivity=sens))
        store.upsert_chunk(Chunk(chunk_id=f"{did}::0", doc_id=did, text="coverage",
                                 ordinal=0, embedding=[1.0] + [0.0] * 7))
    hits = store.vector_search([1.0] + [0.0] * 7, k=5, max_sensitivity="C2 Internal")
    ids = {h["doc_id"] for h in hits}
    assert "pub" in ids and "sec" not in ids   # confidential filtered out


@requires_neo4j
def test_merge_extraction_links_to_chunk_and_backbone(store):
    # backbone already has MiFIR
    store.run("MERGE (:Regulation {name:'MiFIR'})")
    store.upsert_document(Document(doc_id="d2", source_path="p", source_type="pdf",
                                   title="t", domain="mifid", sensitivity="C2 Internal"))
    store.upsert_chunk(Chunk(chunk_id="d2::0", doc_id="d2", text="...", ordinal=0,
                             embedding=[0.0] * 8))
    extraction = {
        "entities": [{"type": "Regulation", "name": "MiFIR", "aliases": ["MiFID II"]},
                     {"type": "InstrumentType", "name": "structured note"}],
        "relationships": [{"source_type": "Regulation", "source_name": "MiFIR",
                           "rel": "GOVERNS", "target_type": "InstrumentType",
                           "target_name": "structured note"}],
        "insights": [{"text": "Coverage depends on classification.",
                      "role": "Compliance Officer",
                      "about": [{"type": "InstrumentType", "name": "structured note"}]}],
    }
    store.merge_extraction(extraction, chunk_id="d2::0")
    assert store.run("MATCH (r:Regulation {name:'MiFIR'}) RETURN count(r) AS c")[0]["c"] == 1
    assert store.run("MATCH (:Regulation)-[g:GOVERNS]->(:InstrumentType) RETURN count(g) AS c")[0]["c"] == 1
    ins = store.run("MATCH (i:Insight)-[:DERIVED_FROM]->(:Chunk {chunk_id:'d2::0'}) RETURN i.role AS role, i.text AS text")
    assert ins[0]["role"] == "Compliance Officer"
    assert store.run("MATCH (:InstrumentType {name:'structured note'})-[:MENTIONED_IN]->(:Chunk) RETURN count(*) AS c")[0]["c"] >= 1
