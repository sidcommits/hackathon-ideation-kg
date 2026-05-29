from dataclasses import dataclass
from typing import Optional


@dataclass
class Document:
    doc_id: str
    source_path: str
    source_type: str          # "xlsx" | "pdf" | "docx" | "pptx" | "conversation"
    title: str
    domain: str
    sensitivity: str
    markdown: Optional[str] = None
    records: Optional[list[dict]] = None
    ingested_at: Optional[str] = None


@dataclass
class Chunk:
    chunk_id: str
    doc_id: str
    text: str
    ordinal: int
    embedding: Optional[list[float]] = None
