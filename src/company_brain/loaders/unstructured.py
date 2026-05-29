import logging
from pathlib import Path

from company_brain.metadata import make_doc_id
from company_brain.model import Document

logger = logging.getLogger(__name__)
LOW_YIELD_CHARS = 200


def _convert(path: str):
    """Isolated so tests can monkeypatch without importing markitdown."""
    from markitdown import MarkItDown
    return MarkItDown().convert(path)


def load_unstructured(path: str, *, source_type: str, domain: str, sensitivity: str) -> Document:
    result = _convert(path)
    text = (getattr(result, "text_content", "") or "")
    if len(text.strip()) < LOW_YIELD_CHARS:
        logger.warning(
            "low-yield extraction: %s produced only %d chars (scanned PDF? consider OCR)",
            path, len(text.strip()),
        )
    return Document(
        doc_id=make_doc_id(path),
        source_path=path,
        source_type=source_type,
        title=Path(path).name,
        domain=domain,
        sensitivity=sensitivity,
        markdown=text,
    )
