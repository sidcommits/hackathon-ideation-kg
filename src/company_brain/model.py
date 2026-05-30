from typing import Optional

from pydantic import BaseModel


class Document(BaseModel):
    """A source-agnostic ingestion unit. PDFs, spreadsheets, transcripts, and
    (later) chat conversations all normalize into this before downstream steps.
    A Pydantic model so it's FastAPI-ready (validation + OpenAPI schema)."""

    doc_id: str
    source_path: str
    source_type: str          # "xlsx" | "pdf" | "docx" | "pptx" | "conversation"
    title: str
    domain: str
    sensitivity: str
    markdown: Optional[str] = None
    records: Optional[list[dict]] = None
    ingested_at: Optional[str] = None


class Chunk(BaseModel):
    chunk_id: str
    doc_id: str
    text: str
    ordinal: int
    embedding: Optional[list[float]] = None
