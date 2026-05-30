import zipfile
from pathlib import Path

_OFFICE_MARKERS = {"xl/": "xlsx", "word/": "docx", "ppt/": "pptx"}


def detect_type(path: str) -> str:
    """Detect file type by content (magic bytes), falling back to extension.

    Office files are ZIP containers, so we look inside to tell xlsx/docx/pptx
    apart. This is why the mislabeled EMT/EET PDFs route correctly.
    """
    with open(path, "rb") as f:
        head = f.read(4)
    if head == b"%PDF":
        return "pdf"
    if head == b"PK\x03\x04":
        try:
            with zipfile.ZipFile(path) as zf:
                names = zf.namelist()
        except zipfile.BadZipFile:
            return "unknown"
        for marker, kind in _OFFICE_MARKERS.items():
            if any(n.startswith(marker) for n in names):
                return kind
        return "unknown"
    ext = Path(path).suffix.lower().lstrip(".")
    return ext if ext in {"pdf", "xlsx", "docx", "pptx"} else "unknown"
