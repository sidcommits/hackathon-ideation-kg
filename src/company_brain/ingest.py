import argparse
import logging
from pathlib import Path

from company_brain.anonymize import anonymize
from company_brain.backbone import merge_backbone
from company_brain.chunk import chunk_markdown
from company_brain.config import get_settings
from company_brain.extract import extract_entities
from company_brain.graph import GraphStore
from company_brain.loaders.router import detect_type
from company_brain.loaders.structured import load_structured
from company_brain.loaders.unstructured import load_unstructured
from company_brain.metadata import infer_domain, infer_sensitivity
from company_brain.providers.embedder import get_embedder
from company_brain.providers.llm import get_provider

logger = logging.getLogger(__name__)


def ingest_path(root: str, *, store, provider, embedder, settings) -> dict:
    summary = {"structured": 0, "unstructured": 0, "skipped": 0}
    for path in sorted(Path(root).rglob("*")):
        if not path.is_file() or path.name.startswith("."):
            continue
        ftype = detect_type(str(path))
        domain = infer_domain(path.name)
        sens = infer_sensitivity(path.name)

        if ftype == "xlsx":
            doc = load_structured(str(path), domain=domain, sensitivity=sens)
            store.upsert_document(doc)
            merge_backbone(store, doc.records or [])
            summary["structured"] += 1
            logger.info("structured: %s (%d records)", path.name, len(doc.records or []))

        elif ftype in {"pdf", "docx", "pptx"}:
            doc = load_unstructured(str(path), source_type=ftype, domain=domain, sensitivity=sens)
            doc.markdown = anonymize(doc.markdown or "")
            store.upsert_document(doc)
            chunks = chunk_markdown(doc, settings.chunk_max_chars, settings.chunk_overlap_chars)
            if chunks:
                vecs = embedder.embed([c.text for c in chunks])
                for c, v in zip(chunks, vecs):
                    c.embedding = v
                    store.upsert_chunk(c)
                for c in chunks:
                    store.merge_extraction(extract_entities(c.text, provider), chunk_id=c.chunk_id)
            summary["unstructured"] += 1
            logger.info("unstructured: %s (%d chunks)", path.name, len(chunks))

        else:
            summary["skipped"] += 1
            logger.info("skipped (type=%s): %s", ftype, path.name)
    return summary


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Ingest a directory into the knowledge graph.")
    parser.add_argument("root", help="directory of source files to ingest")
    args = parser.parse_args()

    settings = get_settings()
    store = GraphStore(settings.neo4j_uri, settings.neo4j_user, settings.neo4j_password)
    embedder = get_embedder(settings)
    store.ensure_schema(embedding_dim=embedder.dim)
    provider = get_provider(settings)
    try:
        summary = ingest_path(args.root, store=store, provider=provider,
                              embedder=embedder, settings=settings)
        logger.info("DONE: %s", summary)
    finally:
        store.close()


if __name__ == "__main__":
    main()
