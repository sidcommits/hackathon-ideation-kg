from neo4j import GraphDatabase

# Sensitivity ordering for access-control filtering (higher = more restricted).
_SENS_RANK = {"C2 Internal": 1, "Confidential": 2}


class GraphStore:
    def __init__(self, uri: str, user: str, password: str):
        self._driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self._driver.close()

    def run(self, cypher: str, **params) -> list[dict]:
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

    _NODE_LABELS = {"Regulation", "DataAttribute", "InstrumentType", "Obligation", "Concept"}

    def merge_extraction(self, extraction: dict, chunk_id: str) -> None:
        """Write extracted entities/relationships/insights, all traced to `chunk_id`.

        Entities MERGE by (label, name) so they resolve against existing backbone
        nodes instead of duplicating. Relationships and insights link to those nodes;
        every entity/insight gets provenance to the source chunk.
        """
        for ent in extraction.get("entities", []):
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

        for rel in extraction.get("relationships", []):
            st, sn = rel.get("source_type"), rel.get("source_name")
            tt, tn = rel.get("target_type"), rel.get("target_name")
            r = rel.get("rel")
            if st not in self._NODE_LABELS or tt not in self._NODE_LABELS:
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

        for idx, ins in enumerate(extraction.get("insights", [])):
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
            for about in ins.get("about", []):
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
