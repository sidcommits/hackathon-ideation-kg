from company_brain.model import Chunk, Document


def chunk_markdown(doc: Document, max_chars: int = 2000, overlap: int = 200) -> list[Chunk]:
    """Greedy character-window chunker that prefers paragraph boundaries.

    Deterministic and dependency-free. Windows of <= max_chars with `overlap`
    characters carried between consecutive chunks for retrieval continuity.
    """
    text = (doc.markdown or "").strip()
    chunks: list[Chunk] = []
    if not text:
        return chunks
    start, ordinal = 0, 0
    n = len(text)
    while start < n:
        end = min(start + max_chars, n)
        if end < n:
            boundary = text.rfind("\n\n", start, end)
            if boundary > start + max_chars // 2:
                end = boundary
        piece = text[start:end].strip()
        if piece:
            chunks.append(Chunk(chunk_id=f"{doc.doc_id}::{ordinal}", doc_id=doc.doc_id,
                                text=piece, ordinal=ordinal))
            ordinal += 1
        if end >= n:
            break
        start = max(end - overlap, start + 1)
    return chunks
