"""Copy the local Neo4j knowledge graph into a Neo4j Aura instance via Cypher.

Why Cypher copy (not neo4j-admin dump/load): it works online, is edition-agnostic
(no Enterprise/admin tooling), preserves the Chunk embedding vectors so Aura's vector
search keeps working, and is idempotent (MERGE-based) — safe to re-run and additive,
so later corpus ingests accumulate.

Source  = the current .env NEO4J_* settings (your local Docker Neo4j).
Target  = AURA_URI / AURA_USER / AURA_PASSWORD (set these in .env, gitignored).

Run:  python scripts/migrate_to_aura.py
It NEVER deletes from either side. It only MERGEs into the target.
"""

import os
import sys
from collections import defaultdict

from company_brain.config import get_settings
from company_brain.graph import GraphStore

# Unique key per node label (matches the constraints in graph.ensure_schema).
KEY = {
    "Regulation": "name",
    "DataAttribute": "name",
    "InstrumentType": "name",
    "Obligation": "name",
    "Concept": "name",
    "Document": "doc_id",
    "Chunk": "chunk_id",
    "Insight": "insight_id",
}


def _require_env(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        sys.exit(f"ERROR: {name} is not set. Add it to .env (AURA_URI / AURA_USER / AURA_PASSWORD).")
    return val


def main() -> None:
    s = get_settings()
    src = GraphStore(s.neo4j_uri, s.neo4j_user, s.neo4j_password)
    aura_uri = _require_env("AURA_URI")
    aura_user = os.environ.get("AURA_USER", "neo4j").strip() or "neo4j"
    aura_pw = _require_env("AURA_PASSWORD")
    tgt = GraphStore(aura_uri, aura_user, aura_pw)

    if aura_uri == s.neo4j_uri:
        sys.exit("ERROR: AURA_URI equals the local NEO4J_URI — refusing to migrate onto itself.")

    print(f"SOURCE: {s.neo4j_uri}")
    print(f"TARGET: {aura_uri}")

    try:
        # 1. Schema on the target: constraints + a vector index sized to the real embeddings.
        dim_rows = src.run(
            "MATCH (c:Chunk) WHERE c.embedding IS NOT NULL "
            "RETURN size(c.embedding) AS d LIMIT 1"
        )
        dim = dim_rows[0]["d"] if dim_rows else 1536
        print(f"embedding dim = {dim}; ensuring target schema + vector index...")
        tgt.ensure_schema(embedding_dim=dim)

        # 2. Copy nodes, grouped by label, with ALL properties (incl. embedding vectors).
        nodes = src.run("MATCH (n) RETURN labels(n)[0] AS label, properties(n) AS props")
        by_label: dict[str, list[dict]] = defaultdict(list)
        for n in nodes:
            by_label[n["label"]].append(n["props"])
        for label, items in by_label.items():
            key = KEY.get(label)
            if not key:
                print(f"  ! skipping {len(items)} node(s) with unmapped label {label!r}")
                continue
            # batch in slices so a big embedding payload doesn't make one huge request
            for i in range(0, len(items), 200):
                batch = items[i:i + 200]
                tgt.run(
                    f"UNWIND $items AS props "
                    f"MERGE (n:{label} {{{key}: props.{key}}}) SET n += props",
                    items=batch,
                )
            print(f"  nodes  {label:15} {len(items)}")

        # 3. Copy relationships, grouped by (sourceLabel, relType, targetLabel).
        rels = src.run(
            "MATCH (a)-[r]->(b) "
            "RETURN labels(a)[0] AS al, properties(a) AS ap, type(r) AS t, "
            "properties(r) AS rp, labels(b)[0] AS bl, properties(b) AS bp"
        )
        groups: dict[tuple, list[dict]] = defaultdict(list)
        skipped = 0
        for r in rels:
            al, bl = r["al"], r["bl"]
            if al not in KEY or bl not in KEY:
                skipped += 1
                continue
            groups[(al, r["t"], bl)].append(
                {"av": r["ap"][KEY[al]], "bv": r["bp"][KEY[bl]], "rp": r["rp"] or {}}
            )
        for (al, t, bl), items in groups.items():
            ak, bk = KEY[al], KEY[bl]
            for i in range(0, len(items), 500):
                batch = items[i:i + 500]
                tgt.run(
                    f"UNWIND $items AS it "
                    f"MATCH (a:{al} {{{ak}: it.av}}), (b:{bl} {{{bk}: it.bv}}) "
                    f"MERGE (a)-[r:{t}]->(b) SET r += it.rp",
                    items=batch,
                )
            print(f"  edges  {al}-[:{t}]->{bl}  {len(items)}")
        if skipped:
            print(f"  ! skipped {skipped} edge(s) with unmapped endpoint labels")

        # 4. Verify counts match.
        sn = src.run("MATCH (n) RETURN count(n) AS c")[0]["c"]
        tn = tgt.run("MATCH (n) RETURN count(n) AS c")[0]["c"]
        se = src.run("MATCH ()-[r]->() RETURN count(r) AS c")[0]["c"]
        te = tgt.run("MATCH ()-[r]->() RETURN count(r) AS c")[0]["c"]
        print(f"\nVERIFY  nodes src={sn} tgt={tn} | edges src={se} tgt={te}")
        print("OK — counts match." if (sn == tn and se == te)
              else "WARNING — counts differ (target may have had prior data; MERGE is additive).")
    finally:
        src.close()
        tgt.close()


if __name__ == "__main__":
    main()
