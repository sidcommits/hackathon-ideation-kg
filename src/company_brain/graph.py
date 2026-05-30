import os
import re
from urllib.parse import urlparse

from neo4j import GraphDatabase

# Sensitivity ordering for access-control filtering (higher = more restricted).
_SENS_RANK = {"C2 Internal": 1, "Confidential": 2}

# --- Destructive-statement guard -------------------------------------------
# A "dry-run demo" once ran `MATCH (n) DETACH DELETE n` against the live Aura
# graph (NEO4J_URI in .env points at cloud) and wiped 3.5k nodes. The same
# wipe lives in every integration-test fixture. To make a graph wipe IMPOSSIBLE
# by accident, run() refuses statements that can destroy data/schema unless an
# explicit env opt-in is set — and refuses them outright on a remote (cloud)
# database unless a SECOND, remote-specific opt-in is also set.
_DESTRUCTIVE = re.compile(r"\bDETACH\s+DELETE\b|\bDROP\s+(?:INDEX|CONSTRAINT)\b", re.IGNORECASE)
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", ""}
# Set to "1" to permit destructive statements at all (e.g. a local test reset).
_ALLOW_ENV = "COMPANY_BRAIN_ALLOW_DESTRUCTIVE"
# Additionally required to permit them against a remote/cloud database.
_ALLOW_REMOTE_ENV = "COMPANY_BRAIN_ALLOW_REMOTE_DESTRUCTIVE"


def _is_remote(uri: str) -> bool:
    """True unless the URI points at a local Neo4j (localhost/127.0.0.1)."""
    try:
        host = (urlparse(uri).hostname or "").lower()
    except Exception:
        return True  # fail safe: treat unparseable as remote
    return host not in _LOCAL_HOSTS


class GraphWipeBlocked(RuntimeError):
    """Raised when a destructive Cypher statement is blocked by the guard."""


class GraphStore:
    def __init__(self, uri: str, user: str, password: str):
        self._uri = uri
        self._remote = _is_remote(uri)
        self._driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self._driver.close()

    def _guard(self, cypher: str) -> None:
        """Block data/schema-destroying statements unless explicitly opted in.

        Raises BEFORE any query reaches the server, so a blocked wipe never
        touches the database.
        """
        if not _DESTRUCTIVE.search(cypher):
            return
        allowed = os.getenv(_ALLOW_ENV) == "1"
        if self._remote and not (allowed and os.getenv(_ALLOW_REMOTE_ENV) == "1"):
            raise GraphWipeBlocked(
                f"Refusing destructive statement against REMOTE graph {self._uri!r}. "
                f"This guard exists because a wipe nuked the live cloud graph. "
                f"If you REALLY mean it, set {_ALLOW_ENV}=1 and {_ALLOW_REMOTE_ENV}=1. "
                f"Statement: {cypher.strip()[:120]!r}"
            )
        if not allowed:
            raise GraphWipeBlocked(
                f"Refusing destructive statement. Set {_ALLOW_ENV}=1 to allow "
                f"(local resets only). Statement: {cypher.strip()[:120]!r}"
            )

    def run(self, cypher: str, **params) -> list[dict]:
        self._guard(cypher)
        with self._driver.session() as session:
            return [r.data() for r in session.run(cypher, **params)]

    def ensure_schema(self, embedding_dim: int):
        constraints = [
            "CREATE CONSTRAINT reg_name IF NOT EXISTS FOR (n:Regulation) REQUIRE n.name IS UNIQUE",
            "CREATE CONSTRAINT attr_name IF NOT EXISTS FOR (n:DataAttribute) REQUIRE n.name IS UNIQUE",
            "CREATE CONSTRAINT inst_name IF NOT EXISTS FOR (n:InstrumentType) REQUIRE n.name IS UNIQUE",
            "CREATE CONSTRAINT concept_name IF NOT EXISTS FOR (n:Concept) REQUIRE n.name IS UNIQUE",
            "CREATE CONSTRAINT doc_id IF NOT EXISTS FOR (n:Document) REQUIRE n.doc_id IS UNIQUE",
            "CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (n:Chunk) REQUIRE n.chunk_id IS UNIQUE",
            "CREATE CONSTRAINT obligation_name IF NOT EXISTS FOR (n:Obligation) REQUIRE n.name IS UNIQUE",
            "CREATE CONSTRAINT insight_id IF NOT EXISTS FOR (n:Insight) REQUIRE n.insight_id IS UNIQUE",
        ]
        for c in constraints:
            self.run(c)
        self.run(
            """
            CREATE VECTOR INDEX chunk_vec IF NOT EXISTS
            FOR (c:Chunk) ON (c.embedding)
            OPTIONS {indexConfig: {`vector.dimensions`: $dim,
                                   `vector.similarity_function`: 'cosine'}}
            """,
            dim=embedding_dim,
        )
        self.run("CALL db.awaitIndexes(30)")

    def upsert_document(self, doc):
        self.run(
            """
            MERGE (d:Document {doc_id: $doc_id})
            SET d.title=$title, d.source_type=$source_type,
                d.domain=$domain, d.sensitivity=$sensitivity, d.source_path=$source_path
            """,
            doc_id=doc.doc_id, title=doc.title, source_type=doc.source_type,
            domain=doc.domain, sensitivity=doc.sensitivity, source_path=doc.source_path,
        )

    def upsert_chunk(self, chunk):
        self.run(
            """
            MATCH (d:Document {doc_id: $doc_id})
            MERGE (c:Chunk {chunk_id: $chunk_id})
            SET c.text=$text, c.ordinal=$ordinal, c.embedding=$embedding
            MERGE (c)-[:PART_OF]->(d)
            """,
            chunk_id=chunk.chunk_id, doc_id=chunk.doc_id, text=chunk.text,
            ordinal=chunk.ordinal, embedding=chunk.embedding,
        )

    def mark_extracted(self, chunk_id: str) -> None:
        """Checkpoint: mark a chunk done AFTER its extraction is written.

        Set only on success, so a chunk whose extraction failed stays pending
        and is retried on the next (resumed) run.
        """
        self.run("MATCH (c:Chunk {chunk_id: $chunk_id}) SET c.extracted = true",
                 chunk_id=chunk_id)

    def pending_chunks(self, chunks) -> list[str]:
        """Return the chunk_ids that still need embedding + extraction (resume support).

        A chunk is DONE when a node with the same chunk_id exists, is marked
        `extracted`, AND its stored text matches (so edited source text re-processes).
        Everything else is pending. Input order is preserved.
        """
        items = [{"chunk_id": c.chunk_id, "text": c.text} for c in chunks]
        done = {
            r["chunk_id"]
            for r in self.run(
                """
                UNWIND $items AS it
                MATCH (c:Chunk {chunk_id: it.chunk_id})
                WHERE coalesce(c.extracted, false) = true AND c.text = it.text
                RETURN c.chunk_id AS chunk_id
                """,
                items=items,
            )
        }
        return [c.chunk_id for c in chunks if c.chunk_id not in done]

    _NODE_LABELS = {"Regulation", "DataAttribute", "InstrumentType", "Obligation", "Concept"}

    def merge_extraction(self, extraction: dict, chunk_id: str) -> None:
        """Write extracted entities/relationships/insights, all traced to `chunk_id`.

        Entities MERGE by (label, name) so they resolve against existing backbone
        nodes instead of duplicating. Relationships and insights link to those nodes;
        every entity/insight gets provenance to the source chunk.
        """
        for ent in extraction.get("entities") or []:
            if not isinstance(ent, dict):
                continue                      # LLM occasionally emits a bare string; skip it
            label = ent.get("type")
            name = ent.get("name")
            if label not in self._NODE_LABELS or not name:
                continue
            self.run(
                f"""
                MATCH (c:Chunk {{chunk_id: $chunk_id}})
                MERGE (n:{label} {{name: $name}})
                SET n.aliases = coalesce($aliases, n.aliases)
                MERGE (n)-[:MENTIONED_IN]->(c)
                """,
                chunk_id=chunk_id, name=name, aliases=ent.get("aliases"),
            )

        for rel in extraction.get("relationships") or []:
            if not isinstance(rel, dict):
                continue
            st, sn = rel.get("source_type"), rel.get("source_name")
            tt, tn = rel.get("target_type"), rel.get("target_name")
            r = rel.get("rel")
            if st not in self._NODE_LABELS or tt not in self._NODE_LABELS:
                continue
            if not sn or not tn:                 # null/empty endpoint name → would break MERGE
                continue
            if r not in {"REQUIRES", "APPLIES_TO", "GOVERNS", "DEFINES", "RELATED_TO"}:
                continue
            self.run(
                f"""
                MERGE (s:{st} {{name: $sn}})
                MERGE (t:{tt} {{name: $tn}})
                MERGE (s)-[:{r}]->(t)
                """,
                sn=sn, tn=tn,
            )

        for idx, ins in enumerate(extraction.get("insights") or []):
            if not isinstance(ins, dict):
                continue
            text = ins.get("text")
            if not text:
                continue
            insight_id = f"{chunk_id}::ins::{idx}"
            self.run(
                """
                MATCH (c:Chunk {chunk_id: $chunk_id})
                MERGE (i:Insight {insight_id: $insight_id})
                SET i.text = $text, i.role = $role
                MERGE (i)-[:DERIVED_FROM]->(c)
                """,
                chunk_id=chunk_id, insight_id=insight_id, text=text,
                role=ins.get("role", "unknown"),
            )
            for about in ins.get("about") or []:
                if not isinstance(about, dict):
                    continue
                lbl, nm = about.get("type"), about.get("name")
                if lbl not in self._NODE_LABELS or not nm:
                    continue
                self.run(
                    f"""
                    MATCH (i:Insight {{insight_id: $insight_id}})
                    MERGE (n:{lbl} {{name: $nm}})
                    MERGE (i)-[:ABOUT]->(n)
                    """,
                    insight_id=insight_id, nm=nm,
                )

    def vector_search(self, query_embedding, k: int, max_sensitivity: str = "C2 Internal"):
        allowed = [s for s, r in _SENS_RANK.items() if r <= _SENS_RANK.get(max_sensitivity, 1)]
        return self.run(
            """
            CALL db.index.vector.queryNodes('chunk_vec', $k, $emb)
            YIELD node, score
            MATCH (node)-[:PART_OF]->(d:Document)
            WHERE d.sensitivity IN $allowed
            RETURN node.chunk_id AS chunk_id, node.text AS text, score,
                   d.doc_id AS doc_id, d.title AS title, d.sensitivity AS sensitivity
            ORDER BY score DESC
            """,
            k=k, emb=query_embedding, allowed=allowed,
        )

    @staticmethod
    def _nid(label: str, name: str) -> str:
        return f"{label}:{name}"

    def touched_subgraph(self, chunk_ids: list[str]) -> dict:
        """Nodes/edges touched by a set of chunks: the chunks, their documents,
        and the entities mentioned in them. IDs are '<Label>:<name>' / 'Chunk:<id>'."""
        rows = self.run(
            """
            UNWIND $chunk_ids AS cid
            MATCH (c:Chunk {chunk_id: cid})-[:PART_OF]->(d:Document)
            OPTIONAL MATCH (e)-[:MENTIONED_IN]->(c)
            WHERE e:Regulation OR e:DataAttribute OR e:InstrumentType
               OR e:Obligation OR e:Concept
            RETURN c.chunk_id AS chunk_id, d.doc_id AS doc_id, d.title AS doc_title,
                   collect(DISTINCT {label: head(labels(e)), name: e.name}) AS entities
            """,
            chunk_ids=chunk_ids,
        )
        nodes: dict[str, dict] = {}
        edges: list[dict] = []
        for r in rows:
            chunk_node = f"Chunk:{r['chunk_id']}"
            doc_node = f"Document:{r['doc_id']}"
            nodes[chunk_node] = {"id": chunk_node, "label": "Chunk"}
            nodes[doc_node] = {"id": doc_node, "label": "Document", "title": r.get("doc_title")}
            edges.append({"from": chunk_node, "to": doc_node, "rel": "PART_OF"})
            for e in r["entities"]:
                if not e or not e.get("name"):
                    continue
                eid = self._nid(e["label"], e["name"])
                nodes[eid] = {"id": eid, "label": e["label"], "name": e["name"]}
                edges.append({"from": eid, "to": chunk_node, "rel": "MENTIONED_IN"})
        return {"nodes": list(nodes.values()), "edges": edges}

    def neighborhood(self, entity_name: str, limit: int = 25) -> dict:
        """1-hop backbone/reasoning neighborhood around a named entity."""
        rows = self.run(
            """
            MATCH (s {name: $name})-[r]->(t)
            WHERE (s:Regulation OR s:DataAttribute OR s:InstrumentType OR s:Obligation OR s:Concept)
              AND (t:Regulation OR t:DataAttribute OR t:InstrumentType OR t:Obligation OR t:Concept)
            RETURN {label: head(labels(s)), name: s.name} AS src,
                   type(r) AS rel,
                   {label: head(labels(t)), name: t.name} AS dst
            LIMIT $limit
            """,
            name=entity_name, limit=limit,
        )
        nodes: dict[str, dict] = {}
        edges: list[dict] = []
        for r in rows:
            s, d = r["src"], r["dst"]
            sid, did = self._nid(s["label"], s["name"]), self._nid(d["label"], d["name"])
            nodes[sid] = {"id": sid, "label": s["label"], "name": s["name"]}
            nodes[did] = {"id": did, "label": d["label"], "name": d["name"]}
            edges.append({"from": sid, "to": did, "rel": r["rel"]})
        return {"nodes": list(nodes.values()), "edges": edges}
