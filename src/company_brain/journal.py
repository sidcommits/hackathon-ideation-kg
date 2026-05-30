"""Append-only ingestion journal — the deletion-proof local backup.

Every expensive artifact (a chunk's embedding, an LLM extraction) is written to a
local JSONL file the instant it is produced. The file is opened ONLY in append
mode and fsync'd per record; nothing in this codebase ever truncates or deletes
it. So the graph (Aura or local Docker) becomes a disposable, rebuildable view:
if it is wiped, `replay()` reconstructs it from the journal with ZERO LLM cost
and ZERO re-embedding.

Records (one JSON object per line):
  {"kind": "document",   "doc": {...}}                 # doc fields (+ records for backbone)
  {"kind": "chunk",      "chunk": {... , "embedding": [...]}}
  {"kind": "extraction", "chunk_id": "...", "extraction": {entities, relationships, insights}}

Replay applies them with MERGE-only writes (via GraphStore), so it is idempotent
and additive — safe to run repeatedly and against a live graph.
"""

import argparse
import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# Sits OUTSIDE planning/ (which gets cleaned) and is gitignored.
DEFAULT_DIR = Path(__file__).resolve().parents[2] / "graph_backup"
DEFAULT_JOURNAL = DEFAULT_DIR / "journal.jsonl"


class Journal:
    """Append-only, fsync'd writer. Never truncates, never deletes."""

    def __init__(self, path=None):
        self.path = Path(path) if path else DEFAULT_JOURNAL
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # mode "a": create-or-append. There is deliberately no code path here
        # that opens for write-truncate ("w") or unlinks the file.
        self._fh = open(self.path, "a", encoding="utf-8")

    def _write(self, rec: dict) -> None:
        self._fh.write(json.dumps(rec, default=str) + "\n")
        self._fh.flush()
        os.fsync(self._fh.fileno())  # durable: survives crash / SIGKILL

    def document(self, doc) -> None:
        d = doc.model_dump()
        d.pop("markdown", None)  # large and not needed to rebuild the graph
        self._write({"kind": "document", "doc": d})

    def chunk(self, chunk) -> None:
        self._write({"kind": "chunk", "chunk": chunk.model_dump()})

    def extraction(self, chunk_id: str, extraction: dict) -> None:
        self._write({"kind": "extraction", "chunk_id": chunk_id, "extraction": extraction})

    def close(self) -> None:
        try:
            self._fh.close()
        except Exception:
            pass


def replay(journal_path, store) -> dict:
    """Rebuild a graph from a journal. MERGE-only; no provider, no embedder."""
    from company_brain.backbone import merge_backbone
    from company_brain.model import Chunk, Document

    counts = {"document": 0, "chunk": 0, "extraction": 0, "bad": 0}
    with open(journal_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                kind = rec["kind"]
                if kind == "document":
                    doc = Document(**rec["doc"])
                    store.upsert_document(doc)
                    if doc.records:
                        merge_backbone(store, doc.records)
                elif kind == "chunk":
                    store.upsert_chunk(Chunk(**rec["chunk"]))
                elif kind == "extraction":
                    store.merge_extraction(rec["extraction"], chunk_id=rec["chunk_id"])
                else:
                    counts["bad"] += 1
                    continue
                counts[kind] += 1
            except Exception:
                counts["bad"] += 1
                logger.exception("skipping malformed journal line")
    return counts


def _infer_dim(journal_path) -> int:
    """First chunk embedding length -> vector-index dimension for a fresh graph."""
    with open(journal_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            if rec.get("kind") == "chunk":
                emb = rec["chunk"].get("embedding")
                if emb:
                    return len(emb)
    return 0


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    ap = argparse.ArgumentParser(description="Rebuild a knowledge graph from an append-only journal.")
    ap.add_argument("--journal", default=str(DEFAULT_JOURNAL))
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--local", action="store_true", help="bolt://localhost:7687 (neo4j/testpassword)")
    g.add_argument("--aura", action="store_true", help="NEO4J_* from .env")
    ap.add_argument("--uri"); ap.add_argument("--user"); ap.add_argument("--password")
    args = ap.parse_args()

    from company_brain.config import get_settings
    from company_brain.graph import GraphStore

    if args.local:
        uri, user, pw = "bolt://localhost:7687", "neo4j", "testpassword"
    elif args.uri:
        uri, user, pw = args.uri, args.user or "neo4j", args.password or "testpassword"
    else:  # default / --aura
        s = get_settings()
        uri, user, pw = s.neo4j_uri, s.neo4j_user, s.neo4j_password

    store = GraphStore(uri, user, pw)
    dim = _infer_dim(args.journal)
    if dim:
        store.ensure_schema(embedding_dim=dim)
    try:
        result = replay(args.journal, store)
        logger.info("REPLAYED %s into %s -> %s", args.journal, uri, result)
    finally:
        store.close()


if __name__ == "__main__":
    main()
