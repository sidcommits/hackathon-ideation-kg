"""Dry-run demo of the ingestion + knowledge-graph pipeline — NO Claude credits spent.

Runs the full pipeline against a couple of safe sample files (the attributes
spreadsheet + the dialogue transcript) using:
  - the REAL structured loader, markitdown loader, anonymizer, chunker
  - the REAL local sentence-transformer embedder (free, on-device)
  - the REAL Neo4j graph store
  - a STUB LLM provider (no Claude call) standing in for extraction

This exercises every module end-to-end and demonstrates the backbone, provenance,
anonymization, and the query() seam without spending API credits.

Usage:  python scripts/demo_dry_run.py
Requires Neo4j running (docker compose up -d) and deps installed.
"""

import logging
import shutil
import tempfile
from pathlib import Path

from company_brain.config import get_settings
from company_brain.graph import GraphStore
from company_brain.ingest import ingest_path
from company_brain.providers.embedder import get_embedder
from company_brain.query import query

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
# Quiet Neo4j "constraint already exists" notifications — expected and noisy.
logging.getLogger("neo4j").setLevel(logging.WARNING)
logging.getLogger("neo4j.notifications").setLevel(logging.ERROR)

REPO = Path(__file__).resolve().parents[1]

# Small, non-confidential files that are cheap to parse. The xlsx drives the
# deterministic backbone; the transcript exercises anonymize + chunk + extract.
SAMPLE_FILES = [
    "SIX_Data Attributes.xlsx",
    "Regulatory Update transcript.docx",
]


class StubProvider:
    """Deterministic, no-cost stand-in for Claude. Emits plausible graph fragments by keyword."""

    def extract(self, system: str, text: str, schema: dict) -> dict:
        low = text.lower()
        entities, relationships, insights = [], [], []
        if "structured" in low and "note" in low:
            entities.append({"type": "InstrumentType", "name": "structured note", "aliases": []})
        if "esg" in low or "sustainab" in low:
            entities.append({"type": "Concept", "name": "ESG", "aliases": []})
        if "coverage" in low or "classif" in low:
            insights.append({
                "text": ("Coverage of structured products depends on reference-data "
                         "classification; new ESG attributes may require onboarding."),
                "role": "Compliance Officer",
                "about": [{"type": "InstrumentType", "name": "structured note"}],
            })
        return {"entities": entities, "relationships": relationships, "insights": insights}


def _count(store, label):
    return store.run(f"MATCH (n:{label}) RETURN count(n) AS c")[0]["c"]


def main():
    settings = get_settings()
    store = GraphStore(settings.neo4j_uri, settings.neo4j_user, settings.neo4j_password)
    embedder = get_embedder(settings)

    print(f"\n== Resetting graph and ensuring schema (embedding dim={embedder.dim}) ==")
    store.run("MATCH (n) DETACH DELETE n")
    # Drop the vector index so it is (re)created at the current embedder's dimension.
    # The index dimension is fixed at creation; switching embedding models (or mixing
    # with the dim-8 test fixtures) otherwise collides. This is the documented reindex step.
    store.run("DROP INDEX chunk_vec IF EXISTS")
    store.ensure_schema(embedding_dim=embedder.dim)

    with tempfile.TemporaryDirectory() as tmp:
        copied = []
        for name in SAMPLE_FILES:
            src = REPO / name
            if src.exists():
                shutil.copy(src, Path(tmp) / name)
                copied.append(name)
        print(f"== Ingesting {len(copied)} sample file(s) (stubbed LLM, no credits) ==")
        for n in copied:
            print(f"   - {n}")
        summary = ingest_path(tmp, store=store, provider=StubProvider(),
                              embedder=embedder, settings=settings)

    print(f"\nINGEST SUMMARY: {summary}")

    print("\n== Node counts ==")
    for label in ["Regulation", "DataAttribute", "InstrumentType", "Concept",
                  "Insight", "Document", "Chunk"]:
        print(f"   {label:<14} {_count(store, label)}")

    print("\n== Deterministic backbone (Regulation -> attributes) ==")
    for row in store.run(
        "MATCH (r:Regulation)-[:REQUIRES]->(a:DataAttribute) "
        "RETURN r.name AS reg, collect(a.name) AS attrs ORDER BY reg"
    ):
        print(f"   {row['reg']} -> {row['attrs']}")

    leaks = store.run(
        "MATCH (i:Insight) WHERE i.text CONTAINS 'Walter' OR i.text CONTAINS 'Mark' "
        "RETURN count(i) AS c"
    )[0]["c"]
    print(f"\n== Anonymization check (personal names in insights, expect 0): {leaks} ==")

    print("\n== Query seam demo ==")
    q = "are ESG-linked structured notes covered?"
    out = query(q, store=store, embedder=embedder, k=3)
    print(f"   Q: {q}")
    print("   citations:")
    for c in out["citations"]:
        snippet = c["chunk_text"][:80].replace("\n", " ")
        print(f"     - [{c['sensitivity']}] {c['doc_title']}: {snippet!r}")
    print("   insights surfaced:")
    seen = set()
    for ctx in out["context"]:
        for ins in ctx["insights"]:
            if ins["text"] not in seen:
                seen.add(ins["text"])
                print(f"     - ({ins['role']}) {ins['text']}")
    if not seen:
        print("     (none linked to the top-k chunks)")

    store.close()
    print("\n== Done (no credits spent) ==\n")


if __name__ == "__main__":
    main()
