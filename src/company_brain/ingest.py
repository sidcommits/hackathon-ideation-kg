import argparse
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from company_brain.anonymize import anonymize
from company_brain.backbone import merge_backbone
from company_brain.chunk import chunk_markdown
from company_brain.config import get_settings
from company_brain.extract import extract_entities
from company_brain.graph import GraphStore
from company_brain.journal import Journal
from company_brain.loaders.router import detect_type
from company_brain.loaders.structured import load_structured
from company_brain.loaders.unstructured import load_unstructured
from company_brain.metadata import infer_domain, infer_sensitivity
from company_brain.providers.embedder import get_embedder
from company_brain.providers.llm import get_provider

logger = logging.getLogger(__name__)


def _safe_extract(chunk, provider):
    """Run one extraction; return the dict, or None on failure (chunk stays pending)."""
    try:
        return extract_entities(chunk.text, provider)
    except Exception:
        logger.exception("extraction failed for chunk %s", chunk.chunk_id)
        return None


def ingest_path(root: str, *, store, provider, embedder, settings, journal=None, workers: int = 1) -> dict:
    summary = {"structured": 0, "unstructured": 0, "skipped": 0, "errors": 0}
    for path in sorted(Path(root).rglob("*")):
        if not path.is_file() or path.name.startswith("."):
            continue
        ftype = detect_type(str(path))
        domain = infer_domain(path.name)
        sens = infer_sensitivity(path.name)

        try:
            if ftype == "xlsx":
                doc = load_structured(str(path), domain=domain, sensitivity=sens)
                store.upsert_document(doc)
                merge_backbone(store, doc.records or [])
                if journal:
                    journal.document(doc)  # carries doc.records -> backbone rebuilds on replay
                summary["structured"] += 1
                logger.info("structured: %s (%d records)", path.name, len(doc.records or []))

            elif ftype in {"pdf", "docx", "pptx"}:
                doc = load_unstructured(str(path), source_type=ftype, domain=domain, sensitivity=sens)
                doc.markdown = anonymize(doc.markdown or "")
                store.upsert_document(doc)
                if journal:
                    journal.document(doc)
                chunks = chunk_markdown(doc, settings.chunk_max_chars, settings.chunk_overlap_chars)
                processed = resumed = 0
                if chunks:
                    # Resume: only embed + extract chunks not already checkpointed.
                    pending_ids = set(store.pending_chunks(chunks))
                    pending = [c for c in chunks if c.chunk_id in pending_ids]
                    resumed = len(chunks) - len(pending)
                    processed = len(pending)
                    if pending:
                        vecs = embedder.embed([c.text for c in pending])
                        for c, v in zip(pending, vecs):
                            c.embedding = v
                            store.upsert_chunk(c)
                            if journal:
                                journal.chunk(c)  # text + embedding persisted before extraction
                        # Extraction is the slow, HTTP-bound step. Run the LLM calls
                        # concurrently across `workers` threads, but apply the graph +
                        # journal writes serially in THIS thread (as results complete),
                        # so there are no concurrent MERGEs on hot shared nodes and the
                        # journal needs no lock.
                        if workers <= 1:
                            results = ((c, _safe_extract(c, provider)) for c in pending)
                        else:
                            ex = ThreadPoolExecutor(max_workers=workers)
                            futs = {ex.submit(_safe_extract, c, provider): c for c in pending}
                            results = ((futs[f], f.result()) for f in as_completed(futs))
                        try:
                            for c, extraction in results:
                                if extraction is None:
                                    continue  # failed/ malformed -> stays pending, retried next run
                                store.merge_extraction(extraction, chunk_id=c.chunk_id)
                                if journal:
                                    journal.extraction(c.chunk_id, extraction)  # the costly LLM output
                                store.mark_extracted(c.chunk_id)   # checkpoint on success only
                        finally:
                            if workers > 1:
                                ex.shutdown(wait=False)
                summary["unstructured"] += 1
                logger.info("unstructured: %s (%d chunks: %d processed, %d resumed/skipped)",
                            path.name, len(chunks), processed, resumed)

            else:
                summary["skipped"] += 1
                logger.info("skipped (type=%s): %s", ftype, path.name)
        except Exception:
            summary["errors"] += 1
            logger.exception("failed to ingest %s", path.name)
    return summary


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Ingest a directory into the knowledge graph.")
    parser.add_argument("root", help="directory of source files to ingest")
    parser.add_argument("--local", action="store_true",
                        help="ingest into local Docker Neo4j (bolt://localhost:7687) instead of NEO4J_URI")
    parser.add_argument("--journal", default=None,
                        help="path to the append-only backup journal (default: graph_backup/journal.jsonl)")
    parser.add_argument("--no-journal", action="store_true", help="disable the local backup journal")
    parser.add_argument("--workers", type=int, default=8,
                        help="concurrent extraction calls (default 8; 1 = serial)")
    args = parser.parse_args()

    settings = get_settings()
    uri = "bolt://localhost:7687" if args.local else settings.neo4j_uri
    user = "neo4j" if args.local else settings.neo4j_user
    password = "testpassword" if args.local else settings.neo4j_password

    store = GraphStore(uri, user, password)
    embedder = get_embedder(settings)
    store.ensure_schema(embedding_dim=embedder.dim)
    provider = get_provider(settings)

    journal = None if args.no_journal else Journal(args.journal)
    if journal:
        logger.info("backup journal (append-only): %s", journal.path)
    logger.info("extraction model=%s  workers=%d", settings.extraction_model, args.workers)
    try:
        summary = ingest_path(args.root, store=store, provider=provider,
                              embedder=embedder, settings=settings, journal=journal,
                              workers=args.workers)
        logger.info("DONE: %s  (target=%s)", summary, uri)
    finally:
        if journal:
            journal.close()
        store.close()


if __name__ == "__main__":
    main()
