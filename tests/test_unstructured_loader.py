import logging
import company_brain.loaders.unstructured as u
from company_brain.loaders.unstructured import load_unstructured


class _Result:
    def __init__(self, text):
        self.text_content = text


def test_returns_markdown(monkeypatch, tmp_path):
    monkeypatch.setattr(u, "_convert", lambda path: _Result("# Title\n\nlots of real content here " * 20))
    p = tmp_path / "a.pdf"; p.write_bytes(b"%PDF-1.5")
    doc = load_unstructured(str(p), source_type="pdf", domain="mifid", sensitivity="C2 Internal")
    assert doc.markdown.startswith("# Title")
    assert doc.source_type == "pdf"


def test_low_yield_warns(monkeypatch, tmp_path, caplog):
    monkeypatch.setattr(u, "_convert", lambda path: _Result("tiny"))
    p = tmp_path / "scan.pdf"; p.write_bytes(b"%PDF-1.5")
    with caplog.at_level(logging.WARNING):
        doc = load_unstructured(str(p), source_type="pdf", domain="tax", sensitivity="C2 Internal")
    assert "low-yield" in caplog.text.lower()
    assert doc.markdown == "tiny"


import pytest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


@pytest.mark.integration
def test_real_transcript_extracts_text():
    docx = REPO / "Regulatory Update transcript.docx"
    doc = load_unstructured(str(docx), source_type="docx", domain="general", sensitivity="C2 Internal")
    assert "instrument" in doc.markdown.lower()
