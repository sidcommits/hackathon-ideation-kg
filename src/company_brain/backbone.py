def merge_backbone(store, records: list[dict]) -> None:
    """Deterministically MERGE Regulation-[:REQUIRES]->DataAttribute from structured records.

    No LLM. Idempotent: re-running with the same records creates no duplicates.
    """
    store.run(
        """
        UNWIND $records AS rec
        MERGE (r:Regulation {name: rec.regulation})
        MERGE (a:DataAttribute {name: rec.attribute})
        MERGE (r)-[:REQUIRES]->(a)
        """,
        records=records or [],
    )
