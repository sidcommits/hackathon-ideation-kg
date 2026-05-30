def query(question: str, *, store, embedder, max_sensitivity: str = "C2 Internal", k: int = 5) -> dict:
    """Retrieval seam consumed by the chat workstream.

    Vector-searches chunks (filtered by access level), then expands the graph
    around each hit to gather related backbone facts and insights. Returns
    context plus a citation per source chunk (title + sensitivity + text).
    """
    q_emb = embedder.embed([question])[0]
    hits = store.vector_search(q_emb, k=k, max_sensitivity=max_sensitivity)

    citations = [
        {"doc_title": h["title"], "doc_id": h["doc_id"], "chunk_id": h["chunk_id"],
         "sensitivity": h["sensitivity"], "chunk_text": h["text"]}
        for h in hits
    ]

    # Batch the per-hit entity/insight expansion into ONE round-trip. The old
    # code ran a separate query per hit (N+1) which added ~1.5-2 s of remote
    # latency on the avatar's critical path. UNWIND fetches them all at once.
    chunk_ids = [h["chunk_id"] for h in hits]
    rows = store.run(
        """
        UNWIND $cids AS cid
        MATCH (c:Chunk {chunk_id: cid})
        OPTIONAL MATCH (e)-[:MENTIONED_IN]->(c)
        OPTIONAL MATCH (i:Insight)-[:DERIVED_FROM]->(c)
        RETURN cid AS chunk_id,
               collect(DISTINCT e.name) AS entities,
               collect(DISTINCT {text: i.text, role: i.role}) AS insights
        """,
        cids=chunk_ids,
    ) if chunk_ids else []
    by_id = {r["chunk_id"]: r for r in rows}

    context = []
    for h in hits:
        row = by_id.get(h["chunk_id"], {"entities": [], "insights": []})
        context.append({
            "chunk_id": h["chunk_id"],
            "chunk_text": h["text"],
            "score": h["score"],
            "entities": [x for x in row["entities"] if x],
            "insights": [x for x in row["insights"] if x and x.get("text")],
        })
    return {"context": context, "citations": citations}
