from company_brain.config import get_settings, Settings


def test_defaults(monkeypatch):
    for k in ["NEO4J_URI", "LLM_PROVIDER", "CHUNK_MAX_CHARS", "MAX_PDF_PAGES"]:
        monkeypatch.delenv(k, raising=False)
    s = get_settings()
    assert isinstance(s, Settings)
    assert s.neo4j_uri == "bolt://localhost:7687"
    assert s.llm_provider == "anthropic"
    assert s.chunk_max_chars == 2000
    assert s.max_pdf_pages == 0


def test_env_override(monkeypatch):
    monkeypatch.setenv("NEO4J_URI", "neo4j+s://demo.databases.neo4j.io")
    monkeypatch.setenv("MAX_PDF_PAGES", "30")
    s = get_settings()
    assert s.neo4j_uri == "neo4j+s://demo.databases.neo4j.io"
    assert s.max_pdf_pages == 30
