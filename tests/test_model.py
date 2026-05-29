from company_brain.model import Document, Chunk


def test_document_minimal():
    d = Document(doc_id="d1", source_path="/x.pdf", source_type="pdf",
                 title="x.pdf", domain="mifid", sensitivity="C2 Internal")
    assert d.markdown is None and d.records is None


def test_chunk():
    c = Chunk(chunk_id="d1::0", doc_id="d1", text="hello", ordinal=0)
    assert c.embedding is None and c.ordinal == 0
