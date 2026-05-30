def query(question: str, *, store, embedder, max_sensitivity: str = "C2 Internal", k: int = 5, use_hybrid: bool = True) -> dict:
    """Retrieval seam consumed by the chat workstream.

    Vector-searches chunks (filtered by access level), then expands the graph
    around each hit to gather related backbone facts and insights. If hybrid
    mode is enabled and Neo4j GDS is available, blends vector similarity with
    FastRP structural embeddings for spatially-aware retrieval.

    Returns context plus a citation per source chunk (title + sensitivity + text).
    """
    q_emb = embedder.embed([question])[0]
    
    # Vector search
    hits = store.vector_search(q_emb, k=k, max_sensitivity=max_sensitivity)
    
    # Hybrid retrieval: blend vector similarity with FastRP structural embeddings
    if use_hybrid and hits:
        try:
            hits = _hybrid_rerank(q_emb, hits, store, embedder)
        except Exception:
            # Graceful fallback: if GDS not available, stick with vector-only
            pass

    citations = [
        {"doc_title": h["title"], "doc_id": h["doc_id"], "chunk_id": h["chunk_id"],
         "sensitivity": h["sensitivity"], "chunk_text": h["text"]}
        for h in hits
    ]

    context = []
    for h in hits:
        related = store.run(
            """
            MATCH (c:Chunk {chunk_id: $cid})
            OPTIONAL MATCH (e)-[:MENTIONED_IN]->(c)
            OPTIONAL MATCH (i:Insight)-[:DERIVED_FROM]->(c)
            RETURN collect(DISTINCT e.name) AS entities,
                   collect(DISTINCT {text: i.text, role: i.role}) AS insights
            """,
            cid=h["chunk_id"],
        )
        row = related[0] if related else {"entities": [], "insights": []}
        context.append({
            "chunk_id": h["chunk_id"],
            "chunk_text": h["text"],
            "score": h["score"],
            "entities": [x for x in row["entities"] if x],
            "insights": [x for x in row["insights"] if x and x.get("text")],
        })
    return {"context": context, "citations": citations}


def _hybrid_rerank(q_emb: list[float], hits: list[dict], store, embedder) -> list[dict]:
    """Blend vector similarity with FastRP structural graph embeddings.

    Requires Neo4j GDS library. Falls back gracefully if GDS is unavailable.
    The hybrid score = 0.7 * vector_similarity + 0.3 * graph_proximity.
    """
    alpha = 0.7  # weight on semantic (vector) similarity
    beta = 0.3   # weight on structural (graph) proximity

    # Ensure the FastRP projection exists; create if needed
    try:
        store.run(
            """
            CALL gds.graph.exists('chunk-projection') YIELD exists
            WITH exists WHERE NOT exists
            CALL gds.graph.project(
                'chunk-projection',
                ['Chunk', 'Document', 'Regulation', 'DataAttribute', 'Concept'],
                {
                    MENTIONED_IN: {orientation: 'UNDIRECTED'},
                    DERIVED_FROM: {orientation: 'UNDIRECTED'},
                    REQUIRES: {orientation: 'UNDIRECTED'}
                }
            )
            YIELD graphName
            RETURN graphName
            """
        )
    except Exception:
        # GDS not available — return vector-only
        return hits

    # Run FastRP to get structural embeddings for all chunk nodes
    try:
        store.run(
            """
            CALL gds.fastRP.mutate(
                'chunk-projection',
                {
                    mutateProperty: 'fastrp_embedding',
                    embeddingDimension: %d,
                    randomSeed: 42
                }
            )
            YIELD nodePropertiesWritten
            """ % len(q_emb)
        )
    except Exception:
        return hits

    # Fetch FastRP embeddings for hit chunks
    chunk_ids = [h["chunk_id"] for h in hits]
    fastrp_rows = store.run(
        """
        MATCH (c:Chunk)
        WHERE c.chunk_id IN $cids AND c.fastrp_embedding IS NOT NULL
        RETURN c.chunk_id AS chunk_id, c.fastrp_embedding AS emb
        """,
        cids=chunk_ids,
    )
    fastrp_map = {r["chunk_id"]: r["emb"] for r in fastrp_rows}

    # Compute hybrid scores
    for h in hits:
        vector_sim = h.get("score", 0.5)
        graph_sim = 0.0

        if h["chunk_id"] in fastrp_map:
            f_emb = fastrp_map[h["chunk_id"]]
            # Cosine similarity between query embedding and FastRP embedding
            dot = sum(a * b for a, b in zip(q_emb, f_emb))
            norm_q = sum(a * a for a in q_emb) ** 0.5
            norm_f = sum(a * a for a in f_emb) ** 0.5
            if norm_q > 0 and norm_f > 0:
                graph_sim = dot / (norm_q * norm_f)

        h["score"] = alpha * vector_sim + beta * graph_sim
        h["_hybrid"] = True

    # Re-sort by hybrid score
    hits.sort(key=lambda h: h["score"], reverse=True)
    return hits