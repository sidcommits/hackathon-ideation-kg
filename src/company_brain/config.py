import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    neo4j_uri: str
    neo4j_user: str
    neo4j_password: str
    llm_provider: str
    anthropic_api_key: str
    extraction_model: str
    embedder: str
    embedding_model: str
    chunk_max_chars: int
    chunk_overlap_chars: int
    max_pdf_pages: int


def get_settings() -> Settings:
    return Settings(
        neo4j_uri=os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        neo4j_user=os.getenv("NEO4J_USER", "neo4j"),
        neo4j_password=os.getenv("NEO4J_PASSWORD", "testpassword"),
        llm_provider=os.getenv("LLM_PROVIDER", "anthropic"),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
        extraction_model=os.getenv("EXTRACTION_MODEL", "claude-sonnet-4-6"),
        embedder=os.getenv("EMBEDDER", "local"),
        embedding_model=os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5"),
        chunk_max_chars=int(os.getenv("CHUNK_MAX_CHARS", "2000")),
        chunk_overlap_chars=int(os.getenv("CHUNK_OVERLAP_CHARS", "200")),
        max_pdf_pages=int(os.getenv("MAX_PDF_PAGES", "0")),
    )
