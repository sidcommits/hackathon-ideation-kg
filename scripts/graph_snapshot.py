"""Portable snapshot / checkpoint / merge tool for the Company-Brain knowledge graph.

Why this exists
---------------
The graph lives on Aura (cloud) and was wiped by a stray `DETACH DELETE`. Community-
edition Neo4j has no online backup, so this provides a dependency-light checkpoint:
it reads every node + relationship into a single JSON file, and restores by **MERGE
only** — it NEVER deletes. That makes it safe to run against the live graph and lets
it double as a one-way *fill* (copy nodes/rels from one graph into another without
removing anything already there).

Stable identity
---------------
Every domain label has a unique-constraint key, so nodes and relationship endpoints
are addressed by (label, key) rather than internal ids — which means a snapshot taken
from LOCAL can be restored into AURA and vice-versa.

Usage
-----
  # checkpoint a graph to snapshots/graph-<host>-<UTC>.json
  python scripts/graph_snapshot.py dump   --local
  python scripts/graph_snapshot.py dump   --aura

  # restore/merge a checkpoint into a target (additive, never deletes)
  python scripts/graph_snapshot.py restore --in snapshots/<file>.json --aura

  # fill: copy everything in LOCAL into AURA (dump source -> merge into target)
  python scripts/graph_snapshot.py copy   --from local --to aura

Connection shorthands: --local = bolt://localhost:7687 (neo4j/testpassword),
--aura = NEO4J_URI/USER/PASSWORD from .env. Or pass an explicit --uri/--user/--password.
"""

import argparse
import datetime as _dt
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from neo4j import GraphDatabase

load_dotenv()

REPO = Path(__file__).resolve().parents[1]
SNAP_DIR = REPO / "snapshots"

# Primary label -> unique key property (mirrors GraphStore.ensure_schema constraints).
LABEL_KEYS = {
    "Regulation": "name",
    "DataAttribute": "name",
    "InstrumentType": "name",
    "Concept": "name",
    "Obligation": "name",
    "Document": "doc_id",
    "Chunk": "chunk_id",
    "Insight": "insight_id",
}


def _conn_from_args(args, role: str):
    """role is 'single' (--uri/--local/--aura) or a --from/--to value ('local'/'aura')."""
    if role in ("local", "aura"):
        kind = role
    elif getattr(args, "local", False):
        kind = "local"
    elif getattr(args, "aura", False):
        kind = "aura"
    elif getattr(args, "uri", None):
        return args.uri, args.user or "neo4j", args.password or "testpassword"
    else:
        raise SystemExit("specify a target: --local, --aura, or --uri/--user/--password")

    if kind == "local":
        return "bolt://localhost:7687", "neo4j", "testpassword"
    # aura
    uri = os.getenv("NEO4J_URI")
    if not uri or "localhost" in uri:
        raise SystemExit(f"--aura expected a remote NEO4J_URI in .env, got {uri!r}")
    return uri, os.getenv("NEO4J_USER"), os.getenv("NEO4J_PASSWORD")


def _primary(labels):
    for lbl in labels:
        if lbl in LABEL_KEYS:
            return lbl, LABEL_KEYS[lbl]
    return None, None


def dump_graph(uri, user, pw) -> dict:
    driver = GraphDatabase.driver(uri, auth=(user, pw))
    nodes, rels, skipped = [], [], 0
    try:
        with driver.session() as s:
            for rec in s.run("MATCH (n) RETURN labels(n) AS labels, properties(n) AS props"):
                labels = rec["labels"]
                lbl, key = _primary(labels)
                if not lbl or rec["props"].get(key) is None:
                    skipped += 1
                    continue
                nodes.append({"labels": labels, "key_prop": key,
                              "key_val": rec["props"][key], "props": rec["props"]})
            for rec in s.run(
                "MATCH (a)-[r]->(b) "
                "RETURN labels(a) AS la, properties(a) AS pa, type(r) AS t, "
                "properties(r) AS pr, labels(b) AS lb, properties(b) AS pb"
            ):
                la, ka = _primary(rec["la"]); lb, kb = _primary(rec["lb"])
                if not la or not lb or rec["pa"].get(ka) is None or rec["pb"].get(kb) is None:
                    skipped += 1
                    continue
                rels.append({
                    "start": {"label": la, "key_prop": ka, "key_val": rec["pa"][ka]},
                    "type": rec["t"], "props": rec["pr"] or {},
                    "end": {"label": lb, "key_prop": kb, "key_val": rec["pb"][kb]},
                })
        meta = {
            "source_uri": uri,
            "exported_utc": _dt.datetime.now(_dt.timezone.utc).isoformat(),
            "node_count": len(nodes), "rel_count": len(rels), "skipped": skipped,
        }
        return {"meta": meta, "nodes": nodes, "rels": rels}
    finally:
        driver.close()


def _chunked(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def restore_graph(snapshot: dict, uri, user, pw, batch: int = 500) -> dict:
    """MERGE every node + relationship into the target. Never deletes.

    Batched with UNWIND so a 20k-node graph is a few dozen round-trips, not 20k —
    essential when the target is a high-latency cloud (Aura) graph.
    """
    driver = GraphDatabase.driver(uri, auth=(user, pw))
    n_nodes = n_rels = 0
    try:
        with driver.session() as s:
            # Nodes grouped by primary label (its key prop is fixed per label).
            by_label = {}
            for node in snapshot["nodes"]:
                by_label.setdefault((node["labels"][0], node["key_prop"]), []).append(
                    {"kv": node["key_val"], "props": node["props"]})
            for (label, key_prop), rows in by_label.items():
                for part in _chunked(rows, batch):
                    s.run(
                        f"UNWIND $rows AS row "
                        f"MERGE (n:`{label}` {{`{key_prop}`: row.kv}}) SET n += row.props",
                        rows=part)
                    n_nodes += len(part)
            # Rels grouped by (type, start label/key, end label/key) so labels are fixed.
            by_rel = {}
            for rel in snapshot["rels"]:
                st, en = rel["start"], rel["end"]
                k = (rel["type"], st["label"], st["key_prop"], en["label"], en["key_prop"])
                by_rel.setdefault(k, []).append(
                    {"ka": st["key_val"], "kb": en["key_val"], "props": rel.get("props", {})})
            for (rtype, sl, sk, el, ek), rows in by_rel.items():
                for part in _chunked(rows, batch):
                    s.run(
                        f"UNWIND $rows AS row "
                        f"MATCH (a:`{sl}` {{`{sk}`: row.ka}}) "
                        f"MATCH (b:`{el}` {{`{ek}`: row.kb}}) "
                        f"MERGE (a)-[r:`{rtype}`]->(b) SET r += row.props",
                        rows=part)
                    n_rels += len(part)
        return {"merged_nodes": n_nodes, "merged_rels": n_rels}
    finally:
        driver.close()


def _default_snap_path(uri) -> Path:
    host = uri.split("://", 1)[-1].split(":")[0].split("/")[0].split(".")[0] or "graph"
    ts = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return SNAP_DIR / f"graph-{host}-{ts}.json"


def _freeze(path: Path, payload: dict) -> None:
    """Write a checkpoint and make it read-only (0444) so nothing overwrites it.
    Each filename is unique (UTC timestamp), so checkpoints are never clobbered."""
    path.write_text(json.dumps(payload, indent=2, default=str))
    os.chmod(path, 0o444)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def add_conn(p):
        p.add_argument("--local", action="store_true")
        p.add_argument("--aura", action="store_true")
        p.add_argument("--uri"); p.add_argument("--user"); p.add_argument("--password")

    d = sub.add_parser("dump", help="export a graph to a JSON checkpoint")
    add_conn(d); d.add_argument("--out")

    r = sub.add_parser("restore", help="MERGE a checkpoint into a target (never deletes)")
    add_conn(r); r.add_argument("--in", dest="infile", required=True)

    c = sub.add_parser("copy", help="dump --from graph and MERGE it into --to graph")
    c.add_argument("--from", dest="src", required=True, choices=["local", "aura"])
    c.add_argument("--to", dest="dst", required=True, choices=["local", "aura"])

    args = ap.parse_args()
    SNAP_DIR.mkdir(exist_ok=True)

    if args.cmd == "dump":
        uri, user, pw = _conn_from_args(args, "single")
        snap = dump_graph(uri, user, pw)
        out = Path(args.out) if args.out else _default_snap_path(uri)
        _freeze(out, snap)
        print(f"checkpoint: {out}  ({snap['meta']['node_count']} nodes, "
              f"{snap['meta']['rel_count']} rels, {snap['meta']['skipped']} skipped)")

    elif args.cmd == "restore":
        uri, user, pw = _conn_from_args(args, "single")
        snap = json.loads(Path(args.infile).read_text())
        res = restore_graph(snap, uri, user, pw)
        print(f"restored into {uri}: {res}")

    elif args.cmd == "copy":
        if args.src == args.dst:
            raise SystemExit("--from and --to must differ")
        suri, su, sp = _conn_from_args(args, args.src)
        turi, tu, tp = _conn_from_args(args, args.dst)
        snap = dump_graph(suri, su, sp)
        # always drop a read-only checkpoint of the source before pushing it anywhere
        cp = _default_snap_path(suri)
        _freeze(cp, snap)
        print(f"source checkpoint: {cp}  ({snap['meta']['node_count']} nodes, {snap['meta']['rel_count']} rels)")
        res = restore_graph(snap, turi, tu, tp)
        print(f"filled {args.dst} ({turi}) from {args.src}: {res}")


if __name__ == "__main__":
    main()
