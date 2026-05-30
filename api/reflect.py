import json
import re
import time

from company_brain.model import Chunk, Document

_DISTILL_SYSTEM = (
    "You distill a support conversation between a user and the SIX Company Brain "
    "into durable, reusable facts ('truths') worth remembering for future "
    "questions. Extract only statements the assistant actually established and "
    "the user did not contradict. Ignore greetings, chit-chat, and unresolved "
    "questions.\n\n"
    "Return ONLY a JSON object, no prose, in exactly this shape:\n"
    '{"summary": "<one sentence>", "truths": [{"question": "<the user\'s question, '
    'normalized>", "answer": "<the established answer>", "entities": ["<named '
    'regulation / data attribute / instrument type / obligation / concept>"]}]}\n'
    'If nothing durable was established, return {"summary": "", "truths": []}.'
)

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)

_ENTITY_LABELS = (
    "n:Regulation OR n:DataAttribute OR n:InstrumentType OR n:Obligation OR n:Concept"
)


def _render(messages: list[dict]) -> str:
    lines = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content") or ""
        if content:
            lines.append(f"{role.upper()}: {content}")
    return "\n\n".join(lines) or "(empty conversation)"


def _coerce_truth(t) -> dict | None:
    if not isinstance(t, dict):
        return None
    q = (t.get("question") or "").strip()
    a = (t.get("answer") or "").strip()
    if not q or not a:
        return None
    ents = [e for e in (t.get("entities") or []) if isinstance(e, str) and e.strip()]
    return {"question": q, "answer": a, "entities": ents}


def _parse(text: str) -> dict:
    raw = text.strip()
    m = _FENCE_RE.search(raw)
    if m:
        raw = m.group(1).strip()
    try:
        obj = json.loads(raw)
    except Exception:
        return {"summary": "", "truths": []}
    if not isinstance(obj, dict):
        return {"summary": "", "truths": []}
    truths = [c for c in (_coerce_truth(t) for t in (obj.get("truths") or [])) if c]
    summary = obj.get("summary") if isinstance(obj.get("summary"), str) else ""
    return {"summary": summary or "", "truths": truths}


async def distill_truths(messages: list[dict], *, client, model: str) -> dict:
    """One read-only Anthropic call → {"summary": str, "truths": [...]}.

    Never raises on a bad model response — returns empty truths instead.
    """
    resp = await client.messages.create(
        model=model,
        max_tokens=1500,
        system=_DISTILL_SYSTEM,
        messages=[{"role": "user", "content": _render(messages)}],
    )
    text = "".join(
        getattr(b, "text", "") for b in resp.content
        if getattr(b, "type", None) == "text"
    )
    return _parse(text)


def ingest_truths(truths: list[dict], *, store, embedder, sensitivity: str,
                  session_id: str) -> dict:
    """Additive-only write of distilled truths as conversation-derived knowledge.

    Per truth: one embedded Chunk under one `conversation` Document, plus a
    `learned` Insight DERIVED_FROM the chunk. Insights link (ABOUT) ONLY to
    entities that already exist — entity nodes are never created. Everything is
    tagged learned=true for traceability/pruning. No destructive statements.
    """
    doc_id = f"conversation:{session_id}"
    counts = {"doc_id": doc_id, "chunks_written": 0, "insights_written": 0,
              "entities_linked": 0}
    if not truths:
        return counts

    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    doc = Document(
        doc_id=doc_id,
        source_path=f"conversation://{session_id}",
        source_type="conversation",
        title=f"Chat learnings — {session_id}",
        domain="conversation",
        sensitivity=sensitivity,
    )
    store.upsert_document(doc)
    store.run(
        "MATCH (d:Document {doc_id:$id}) "
        "SET d.learned=true, d.ingested_at=$ts, d.session_id=$sid",
        id=doc_id, ts=ts, sid=session_id,
    )

    for idx, t in enumerate(truths):
        text = f"Q: {t['question']}\nA: {t['answer']}"
        chunk_id = f"{doc_id}::t{idx}"
        embedding = embedder.embed([text])[0]
        store.upsert_chunk(Chunk(chunk_id=chunk_id, doc_id=doc_id, text=text,
                                 ordinal=idx, embedding=embedding))
        store.run("MATCH (c:Chunk {chunk_id:$cid}) SET c.learned=true", cid=chunk_id)
        counts["chunks_written"] += 1

        insight_id = f"{chunk_id}::ins"
        store.run(
            "MATCH (c:Chunk {chunk_id:$cid}) "
            "MERGE (i:Insight {insight_id:$iid}) "
            "SET i.text=$text, i.role='learned', i.learned=true "
            "MERGE (i)-[:DERIVED_FROM]->(c)",
            cid=chunk_id, iid=insight_id, text=t["answer"],
        )
        counts["insights_written"] += 1

        for name in t.get("entities") or []:
            store.run(
                f"MATCH (i:Insight {{insight_id:$iid}}) "
                f"MATCH (n {{name:$nm}}) WHERE {_ENTITY_LABELS} "
                f"MERGE (i)-[:ABOUT]->(n)",
                iid=insight_id, nm=name,
            )
            counts["entities_linked"] += 1

    return counts
