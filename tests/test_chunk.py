from company_brain.model import Document
from company_brain.chunk import chunk_markdown


def _doc(md):
    return Document(doc_id="d1", source_path="x", source_type="pdf",
                    title="x", domain="g", sensitivity="C2 Internal", markdown=md)


def test_empty_returns_no_chunks():
    assert chunk_markdown(_doc(""), max_chars=100, overlap=10) == []


def test_splits_long_text_with_overlap():
    md = "\n\n".join(f"Paragraph {i} " + "word " * 30 for i in range(10))
    chunks = chunk_markdown(_doc(md), max_chars=300, overlap=50)
    assert len(chunks) > 1
    assert [c.ordinal for c in chunks] == list(range(len(chunks)))
    assert all(c.chunk_id == f"d1::{c.ordinal}" for c in chunks)
    assert all(len(c.text) <= 300 for c in chunks)
    # overlap: end of chunk 0 shares text with start of chunk 1
    assert chunks[0].text[-20:] in (chunks[0].text + chunks[1].text)
