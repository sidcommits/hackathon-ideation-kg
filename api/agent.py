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

# Farewells / thanks / closers — answered instantly, NO retrieval and NO "let me
# check" filler (saying that before a goodbye is what made the avatar feel dumb).
_FAREWELL_RE = re.compile(
    r"^\s*(bye|goodbye|good\s*bye|see\s*you|see\s*ya|ttyl|cheers|"
    r"thanks?|thank\s*you|thanks?\s*(a\s*lot|so\s*much)|ta|much\s*appreciated|"
    r"that'?s\s*(all|it)|no\s*(thanks|thank\s*you)|i'?m\s*good|we'?re\s*done|"
    r"that\s*helps|perfect\s*thanks?|ok\s*thanks?|okay\s*thanks?)"
    r"[\s!?.]*$",
    re.IGNORECASE,
)
_FAREWELL_REPLY = (
    "Happy to help — reach out any time you have another regulatory or coverage "
    "question. Goodbye!"
)

# Short, natural, rotating acknowledgements. One is spoken the instant a
# substantive question arrives so Beyond Presence gets a token inside its response
# window (avatar never freezes) WITHOUT the robotic "Let me check the Company
# Brain for that" on every single turn.
_ACK_REPLIES = (
    "One moment.",
    "Let me look into that.",
    "Sure — let me check.",
    "Good question. Let me find that for you.",
    "Let me pull that up.",
)


def _pick_ack(seed_text: str) -> str:
    """Deterministically vary the filler by question so it isn't identical each turn."""
    return _ACK_REPLIES[len(seed_text) % len(_ACK_REPLIES)] + " "


_SPOKEN_TAG = "[SPOKEN]"
_DETAIL_TAG = "[DETAIL]"
# Tolerant matchers: the model occasionally wraps the labels in markdown emphasis
# or changes case (e.g. "**[DETAIL]**", "[Detail]"). Require the brackets so the
# plain word "detail" inside the spoken summary can't trigger a false split.
_SPOKEN_TAG_RE = re.compile(r"^\s*\*{0,3}\[\s*SPOKEN\s*\]\*{0,3}\s*:?\s*", re.IGNORECASE)
_DETAIL_TAG_RE = re.compile(r"\*{0,3}\[\s*DETAIL\s*\]\*{0,3}\s*:?\s*", re.IGNORECASE)

# Voice synthesis output contract appended to the system prompt in voice mode.
_VOICE_FORMAT = (
    "\n\n# Output format — MANDATORY, follow EXACTLY\n"
    "Your reply MUST contain TWO sections, in this exact order, each introduced by "
    "its label ALONE on its own line, written verbatim with the square brackets:\n\n"
    f"{_SPOKEN_TAG}\n"
    "A natural spoken-voice summary, 3 to 5 sentences. State the answer and the one "
    "or two key reasons. Conversational. NO citations, NO bullet lists, NO markdown "
    "headings, NO tables.\n\n"
    f"{_DETAIL_TAG}\n"
    "The COMPLETE answer in structured markdown — the full explanation, lists, and "
    "tables as needed — citing the source documents the passages came from.\n\n"
    f"Rules: emit the literal text {_SPOKEN_TAG} and {_DETAIL_TAG} exactly (with "
    f"brackets). NEVER omit {_DETAIL_TAG}. The {_DETAIL_TAG} section is the real "
    "answer and must be self-contained — do not write 'see above' or shorten it."
)


def _chunk_text(text: str, size: int = 24):
    for i in range(0, len(text), size):
        yield text[i:i + size]


def _strip_spoken_tag(s: str) -> str:
    """Trim whitespace and a leading [SPOKEN] label (any case / emphasis) off the
    spoken section."""
    return _SPOKEN_TAG_RE.sub("", s.strip()).strip()


class _VoiceSplitter:
    """Route a voice synthesis stream into (channel, text) pairs.

    Model output: an optional [SPOKEN] label, the spoken paragraph, a [DETAIL]
    delimiter, then the full markdown answer.

    Spoken tokens are streamed progressively to the avatar as they arrive — NOT
    buffered until [DETAIL] is found. Buffering the entire spoken section created
    an 8-12 s silent gap after the ack token, causing Beyond Presence to time out
    and cut off the avatar mid-turn.

    Protocol:
      1. Buffer the first _LABEL_BUF chars to detect and strip any [SPOKEN] label.
      2. Once the label is gone, stream spoken tokens directly (keeping a short tail
         to safely straddle a [DETAIL] tag that arrives across chunk boundaries).
      3. When [DETAIL] is found, switch to detail mode and stream everything after.
      4. flush() drains whatever remains (handles max_tokens truncation).
    """

    # Chars to hold before we're confident the [SPOKEN] label has been seen/stripped.
    _LABEL_BUF = 60
    # Chars kept as a look-ahead tail so [DETAIL] can't be missed at a chunk edge.
    _TAIL = len("[DETAIL]") + 10  # ~18

    def __init__(self):
        self._buf = ""
        self._label_stripped = False
        self._in_detail = False

    def feed(self, text: str):
        if self._in_detail:
            return [("detail", text)] if text else []

        self._buf += text
        out = []

        # Phase 1 — label stripping: hold until we have enough chars to be sure.
        if not self._label_stripped:
            if len(self._buf) < self._LABEL_BUF and not _DETAIL_TAG_RE.search(self._buf):
                return []  # still accumulating for label detection
            self._buf = _SPOKEN_TAG_RE.sub("", self._buf).lstrip("\n ")
            self._label_stripped = True

        # Phase 2 — progressive spoken streaming: emit all but the look-ahead tail.
        m = _DETAIL_TAG_RE.search(self._buf)
        if m:
            # [DETAIL] found — emit remaining spoken part, switch to detail.
            spoken_part = self._buf[: m.start()].rstrip()
            if spoken_part:
                out.append(("spoken", spoken_part))
            rest = self._buf[m.end() :].lstrip("\n ")
            self._buf = ""
            self._in_detail = True
            if rest:
                out.append(("detail", rest))
        else:
            # Not in detail yet — stream everything except the tail so [DETAIL]
            # can never be split across two feed() calls.
            if len(self._buf) > self._TAIL:
                to_emit = self._buf[: -self._TAIL]
                self._buf = self._buf[-self._TAIL :]
                if to_emit:
                    out.append(("spoken", to_emit))

        return out

    def flush(self):
        if self._in_detail:
            return []
        remaining = self._buf if self._label_stripped else _strip_spoken_tag(self._buf)
        self._buf = ""
        return [("both", remaining)] if remaining else []


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
    mode: str = "text",
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

    voice = mode == "voice"
    ack_channel = "spoken" if voice else "full"
    greet_channel = "both" if voice else "full"

    if _GREETING_RE.match(last_user_text):
        for piece in _chunk_text(_GREETING_REPLY):
            yield Token(text=piece, channel=greet_channel)
        yield MessageEnd(stop_reason="end_turn")
        return

    # ── Farewell / thanks fast-path ───────────────────────────────────────────
    # No retrieval and no "let me check" filler — just a warm close.
    if _FAREWELL_RE.match(last_user_text):
        for piece in _chunk_text(_FAREWELL_REPLY):
            yield Token(text=piece, channel=greet_channel)
        yield MessageEnd(stop_reason="end_turn")
        return

    # ── Immediate acknowledgement ─────────────────────────────────────────────
    # A short, varied, natural filler keeps BP alive through retrieval latency
    # without the robotic "Let me check the Company Brain" on every turn.
    yield Token(text=_pick_ack(last_user_text), channel=ack_channel)

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
    if voice:
        augmented_system += _VOICE_FORMAT

    stop_reason = "end_turn"
    try:
        async with client.messages.stream(
            model=model,
            max_tokens=4096,
            system=augmented_system,
            messages=convo,
        ) as stream:
            if voice:
                splitter = _VoiceSplitter()
                async for text in stream.text_stream:
                    for ch, chunk in splitter.feed(text):
                        yield Token(text=chunk, channel=ch)
                for ch, chunk in splitter.flush():
                    yield Token(text=chunk, channel=ch)
            else:
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
                 "Please try again.",
            channel="both" if voice else "full",
        )
        stop_reason = "error"

    for c in pending_citations:
        yield c
    yield MessageEnd(stop_reason=stop_reason)


def make_client(api_key: str) -> AsyncAnthropic:
    return AsyncAnthropic(api_key=api_key)
