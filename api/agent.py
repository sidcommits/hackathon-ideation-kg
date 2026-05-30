import asyncio
import re

from anthropic import AsyncAnthropic

from api.events import (
    Citation, MessageEnd, MessageStart, Token, ToolCall, ToolResult,
)

# Simple conversational patterns that should skip the full RAG pipeline
# and respond instantly so Beyond Presence avatar doesn't time out.
_GREETING_RE = re.compile(
    r"^\s*(hi|hey|hello|good\s*(morning|afternoon|evening)|howdy|greetings|what'?s\s*up|yo)[\s!?.]*$",
    re.IGNORECASE,
)
_GREETING_REPLY = (
    "Hello! I'm the SIX Corporate Advisor, powered by the Company Brain. "
    "I can answer questions about MiFID II, SFDR, EU Taxonomy, FATCA, and other "
    "regulatory frameworks. What would you like to explore today?"
)
# Spoken immediately on substantive questions so Beyond Presence receives a token
# within its short response window while retrieval + synthesis run behind it.
_ACK_REPLY = "Let me check the Company Brain for that. "


def _chunk_text(text: str, size: int = 24):
    for i in range(0, len(text), size):
        yield text[i:i + size]


async def run_agent(
    messages,
    *,
    client,
    run_tool,
    store,
    embedder,
    max_sensitivity,
    model,
    system,
):
    """Drive a single-shot RAG turn, yielding typed Events.

    Latency architecture for the Beyond Presence avatar (first token must arrive
    inside BP's short response window, or the avatar freezes):

    - Greeting fast-path     → < 0.5 s, no LLM call.
    - Acknowledgement token  → emitted instantly so BP starts speaking.
    - Deterministic retrieve → we call search_knowledge OURSELVES (the system
      prompt mandates it on every question), so we skip an entire Claude
      "decide to call a tool" round-trip (~5 s saved).
    - Single streaming synth → ONE ``client.messages.stream`` call with the
      retrieved passages injected into the system prompt. First real token in
      ~3-4 s instead of ~9-13 s.

    ToolCall / ToolResult / Citation events are still emitted around the
    deterministic retrieval so the web graph-visualisation keeps working — both
    /chat (web) and /v1/chat/completions (avatar) share this generator.

    Uses ``AsyncAnthropic`` so streaming runs on the event loop directly (no
    sync-SDK-in-a-thread bridge, which used to raise "Event loop is closed").
    """
    convo = list(messages)

    yield MessageStart(id="msg")

    # ── Greeting fast-path ────────────────────────────────────────────────────
    last_user_text = ""
    for m in reversed(convo):
        if m.get("role") == "user":
            c = m.get("content", "")
            last_user_text = c if isinstance(c, str) else ""
            break

    if _GREETING_RE.match(last_user_text):
        for piece in _chunk_text(_GREETING_REPLY):
            yield Token(text=piece)
        yield MessageEnd(stop_reason="end_turn")
        return

    # ── Immediate acknowledgement ─────────────────────────────────────────────
    # First byte to BP in ~0.1 s keeps the avatar alive through retrieval latency.
    yield Token(text=_ACK_REPLY)

    # ── Deterministic retrieval (replaces the Claude tool-decision turn) ───────
    seen_chunks: set[str] = set()
    pending_citations: list[Citation] = []
    tu_id = "call_search_knowledge"
    tu_args = {"query": last_user_text or ""}
    yield ToolCall(id=tu_id, name="search_knowledge", args=tu_args)

    # run_tool is blocking (embeddings + Neo4j) — keep it off the loop. It can
    # throw (missing index, dim mismatch, network); NEVER let it propagate or the
    # avatar freezes. Degrade to an empty result so synthesis can still speak.
    try:
        model_result, delta, citations = await asyncio.to_thread(
            run_tool,
            "search_knowledge", tu_args,
            store=store, embedder=embedder, max_sensitivity=max_sensitivity,
        )
    except Exception as exc:
        print(f"[run_agent] search_knowledge failed: {exc!r}")
        model_result = (
            "The knowledge base could not be reached. Tell the user you were "
            "unable to look this up right now and to try again."
        )
        delta, citations = {"nodes": [], "edges": []}, []

    summary = model_result.splitlines()[0][:120] if model_result else "no result"
    yield ToolResult(id=tu_id, summary=summary, graph_delta=delta)
    for c in citations:
        if c["chunk_id"] in seen_chunks:
            continue
        seen_chunks.add(c["chunk_id"])
        pending_citations.append(Citation(
            doc_title=c["doc_title"], sensitivity=c["sensitivity"],
            chunk_text=c["chunk_text"],
        ))

    # ── Single streaming synthesis ────────────────────────────────────────────
    augmented_system = (
        f"{system}\n\n"
        "# Retrieved context\n"
        "Answer using ONLY the passages below. Cite the documents they came from. "
        "If the passages are empty or irrelevant, say you could not find it — do "
        "not invent an answer.\n\n"
        f"{model_result}"
    )

    stop_reason = "end_turn"
    try:
        async with client.messages.stream(
            model=model,
            max_tokens=2048,
            system=augmented_system,
            messages=convo,
        ) as stream:
            async for text in stream.text_stream:
                yield Token(text=text)
            final = await stream.get_final_message()
            stop_reason = final.stop_reason or "end_turn"
    except Exception as exc:
        # Surface, never swallow — the avatar must say something and the stream
        # must terminate.
        print(f"[run_agent] synthesis streaming failed: {exc!r}")
        yield Token(
            text="Sorry — I ran into a problem composing that answer. "
                 "Please try again."
        )
        stop_reason = "error"

    for c in pending_citations:
        yield c
    yield MessageEnd(stop_reason=stop_reason)


def make_client(api_key: str) -> AsyncAnthropic:
    return AsyncAnthropic(api_key=api_key)
