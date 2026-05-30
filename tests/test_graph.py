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
    gs.run("DROP INDEX chunk_vec IF EXISTS")  # avoid dim clash with a leftover index
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


@requires_neo4j
def test_merge_extraction_is_idempotent_for_insights(store):
    store.upsert_document(Document(doc_id="d3", source_path="p", source_type="pdf",
                                   title="t", domain="g", sensitivity="C2 Internal"))
    store.upsert_chunk(Chunk(chunk_id="d3::0", doc_id="d3", text="x", ordinal=0,
                             embedding=[0.0] * 8))
    extraction = {"entities": [], "relationships": [],
                  "insights": [{"text": "Coverage depends on classification.",
                                "role": "Compliance Officer",
                                "about": [{"type": "Concept", "name": "coverage"}]}]}
    store.merge_extraction(extraction, chunk_id="d3::0")
    store.merge_extraction(extraction, chunk_id="d3::0")   # re-run must not duplicate
    n = store.run("MATCH (i:Insight)-[:DERIVED_FROM]->(:Chunk {chunk_id:'d3::0'}) RETURN count(i) AS c")[0]["c"]
    assert n == 1
    about = store.run("MATCH (:Insight {insight_id:'d3::0::ins::0'})-[:ABOUT]->(:Concept {name:'coverage'}) RETURN count(*) AS c")[0]["c"]
    assert about == 1


@requires_neo4j
def test_merge_extraction_tolerates_malformed_items(store):
    store.upsert_document(Document(doc_id="d4", source_path="p", source_type="pdf",
                                   title="t", domain="g", sensitivity="C2 Internal"))
    store.upsert_chunk(Chunk(chunk_id="d4::0", doc_id="d4", text="x", ordinal=0, embedding=[0.0] * 8))
    # The LLM occasionally emits bare strings instead of objects — must not crash.
    bad = {
        "entities": ["just a string", {"type": "Concept", "name": "FATCA"}],
        "relationships": ["nope"],
        "insights": ["bad",
                     {"text": "ok insight", "role": "Officer",
                      "about": ["bareword", {"type": "Concept", "name": "FATCA"}]}],
    }
    store.merge_extraction(bad, chunk_id="d4::0")          # must not raise
    assert store.run("MATCH (:Concept {name:'FATCA'}) RETURN count(*) AS c")[0]["c"] == 1
    assert store.run("MATCH (i:Insight {insight_id:'d4::0::ins::1'}) RETURN count(i) AS c")[0]["c"] == 1


@requires_neo4j
def test_pending_chunks_and_mark_extracted(store):
    store.upsert_document(Document(doc_id="rd", source_path="p", source_type="pdf",
                                   title="t", domain="g", sensitivity="C2 Internal"))
    chunks = [Chunk(chunk_id=f"rd::{i}", doc_id="rd", text=f"text {i}", ordinal=i,
                    embedding=[0.0] * 8) for i in range(3)]
    for c in chunks:
        store.upsert_chunk(c)

    # Nothing checkpointed yet → all pending, order preserved.
    assert store.pending_chunks(chunks) == ["rd::0", "rd::1", "rd::2"]

    store.mark_extracted("rd::0")
    store.mark_extracted("rd::1")
    assert store.pending_chunks(chunks) == ["rd::2"]        # done ones skipped

    # Edited text re-opens a previously-done chunk. pending_chunks runs BEFORE the
    # re-upsert (as in the ingest flow), so it compares new text vs the stored text.
    chunks[1].text = "EDITED"
    assert set(store.pending_chunks(chunks)) == {"rd::1", "rd::2"}
