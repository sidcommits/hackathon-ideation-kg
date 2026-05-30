import zipfile
from company_brain.loaders.router import detect_type


def test_pdf_by_magic(tmp_path):
    p = tmp_path / "mislabeled.xlsx"   # extension lies; content is PDF
    p.write_bytes(b"%PDF-1.5\n...rest...")
    assert detect_type(str(p)) == "pdf"


def test_xlsx_by_content(tmp_path):
    p = tmp_path / "real.xlsx"
    with zipfile.ZipFile(p, "w") as z:
        z.writestr("xl/workbook.xml", "<x/>")
    assert detect_type(str(p)) == "xlsx"


def test_docx_by_content(tmp_path):
    p = tmp_path / "doc.docx"
    with zipfile.ZipFile(p, "w") as z:
        z.writestr("word/document.xml", "<x/>")
    assert detect_type(str(p)) == "docx"


def test_unknown(tmp_path):
    p = tmp_path / "note.txt"
    p.write_bytes(b"just text")
    assert detect_type(str(p)) == "unknown"
