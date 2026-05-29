import pytest
from tests.conftest import requires_neo4j
from company_brain.config import get_settings
from company_brain.graph import GraphStore
from company_brain.ingest import ingest_path


@pytest.fixture
def store():
    s = get_settings()
    gs = GraphStore(s.neo4j_uri, s.neo4j_user, s.neo4j_password)
    gs.run("MATCH (n) DETACH DELETE n")
    gs.ensure_schema(embedding_dim=8)
    yield gs
    gs.close()


@requires_neo4j
def test_ingests_structured_and_unstructured(tmp_path, store, fake_provider, fake_embedder, monkeypatch):
    # structured: a tiny real xlsx
    from openpyxl import Workbook
    wb = Workbook(); ws = wb.active
    ws.append(["SIX - Data Fields"]); ws.append([]); ws.append(["Regulation", "Data attribute"])
    ws.append(["MiFIR / MiFID", "Reportable Instrument"])
    ws.append([None, "Complex / Non-complex"])
    xlsx = tmp_path / "SIX_Data Attributes.xlsx"; wb.save(xlsx)

    # unstructured: stub markitdown so no real parsing/LLM
    import company_brain.loaders.unstructured as u
    class _R: text_content = "Participants: Walter (Compliance Officer)\nWalter: structured notes coverage depends on classification. " * 5
    monkeypatch.setattr(u, "_convert", lambda path: _R())
    pdf = tmp_path / "EU_MIFID_note.pdf"; pdf.write_bytes(b"%PDF-1.5 fake")

    canned = {"entities": [{"type": "InstrumentType", "name": "structured note"}],
              "relationships": [], "insights": [
                  {"text": "Coverage depends on classification.", "role": "Compliance Officer",
                   "about": [{"type": "InstrumentType", "name": "structured note"}]}]}

    summary = ingest_path(str(tmp_path), store=store,
                          provider=fake_provider(canned), embedder=fake_embedder(),
                          settings=get_settings())

    assert summary["structured"] == 1 and summary["unstructured"] == 1
    assert store.run("MATCH (:Regulation)-[:REQUIRES]->(:DataAttribute) RETURN count(*) AS c")[0]["c"] == 2
    assert store.run("MATCH (i:Insight)-[:DERIVED_FROM]->(:Chunk) RETURN count(i) AS c")[0]["c"] >= 1
    assert store.run("MATCH (i:Insight) WHERE i.text CONTAINS 'Walter' RETURN count(i) AS c")[0]["c"] == 0


@requires_neo4j
def test_bad_file_does_not_abort_run(tmp_path, store, fake_provider, fake_embedder, monkeypatch):
    from openpyxl import Workbook
    wb = Workbook(); ws = wb.active
    ws.append(["Regulation", "Data attribute"]); ws.append(["SFDR", "Waste"])
    good = tmp_path / "SIX_Data Attributes.xlsx"; wb.save(good)

    # a pdf whose loader will raise
    import company_brain.loaders.unstructured as u
    def _boom(path): raise RuntimeError("bad pdf")
    monkeypatch.setattr(u, "_convert", _boom)
    bad = tmp_path / "EU_SFDR_broken.pdf"; bad.write_bytes(b"%PDF-1.5 fake")

    summary = ingest_path(str(tmp_path), store=store, provider=fake_provider(),
                          embedder=fake_embedder(), settings=get_settings())
    assert summary["errors"] == 1          # the bad pdf was caught
    assert summary["structured"] == 1      # the good xlsx still processed
