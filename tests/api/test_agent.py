import pytest

from api.agent import run_agent
from api.events import MessageStart, MessageEnd, Token, ToolCall, ToolResult, Citation


# ── Fakes (mirror the AsyncAnthropic contract) ───────────────────────────────
class _Block:
    """Mimics an Anthropic content block (text or tool_use)."""
    def __init__(self, **kw):
        self.__dict__.update(kw)


class _FakeMessage:
    def __init__(self, content, stop_reason):
        self.content = content
        self.stop_reason = stop_reason


class _FakeStream:
    """Async context manager mirroring client.messages.stream(...)."""
    def __init__(self, message, raises=None):
        self._message = message
        self._raises = raises

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    @property
    def text_stream(self):
        message, raises = self._message, self._raises

        async def gen():
            if raises:
                raise raises
            for block in message.content:
                if getattr(block, "type", None) == "text":
                    yield block.text

        return gen()

    async def get_final_message(self):
        return self._message


class _FakeMessages:
    """Single-shot RAG only streams once; create() should never be called."""
    def __init__(self, stream_message, stream_raises=None):
        self._stream_message = stream_message
        self._stream_raises = stream_raises
        self.create_calls = []
        self.stream_calls = []

    async def create(self, **kwargs):  # pragma: no cover - must not be reached
        self.create_calls.append(kwargs)
        raise AssertionError("run_agent must not make a non-streaming Turn-1 call")

    def stream(self, **kwargs):
        self.stream_calls.append(kwargs)
        return _FakeStream(self._stream_message, raises=self._stream_raises)


class _FakeClient:
    def __init__(self, answer_text, stop_reason="end_turn", stream_raises=None):
        msg = _FakeMessage(content=[_Block(type="text", text=answer_text)],
                           stop_reason=stop_reason)
        self.messages = _FakeMessages(msg, stream_raises=stream_raises)


def _text_block(text):
    return _Block(type="text", text=text)


def _make_tool_runner(model_result, delta=None, citations=None):
    delta = delta if delta is not None else {"nodes": [], "edges": []}
    citations = citations if citations is not None else []
    calls = []

    def run_tool(name, args, *, store, embedder, max_sensitivity):
        calls.append((name, args))
        return model_result, delta, citations

    run_tool.calls = calls
    return run_tool


async def _collect(agen):
    return [event async for event in agen]


@pytest.fixture
def base_kwargs():
    return dict(
        store=object(),
        embedder=object(),
        max_sensitivity="C2 Internal",
        model="claude-x",
        system="SYS",
    )


@pytest.mark.asyncio
async def test_single_shot_emits_well_formed_sequence(base_kwargs):
    client = _FakeClient("Structured notes are covered under MiFID II.")
    run_tool = _make_tool_runner(
        "MiFID II covers structured notes.",
        {"nodes": [{"id": "n1"}], "edges": []},
        [{"chunk_id": "c1", "doc_title": "MiFID Guide",
          "sensitivity": "C2 Internal", "chunk_text": "..."}],
    )

    events = await _collect(run_agent(
        [{"role": "user", "content": "Are structured notes covered?"}],
        client=client, run_tool=run_tool, **base_kwargs,
    ))

    types = [type(e).__name__ for e in events]
    assert types[0] == "MessageStart"
    assert "ToolCall" in types and "ToolResult" in types and "Citation" in types
    assert types[-1] == "MessageEnd"
    # Retrieval drives synthesis: tool round before the streamed answer.
    assert types.index("ToolCall") < types.index("MessageEnd")
    answer = "".join(e.text for e in events if isinstance(e, Token))
    assert "Structured notes are covered under MiFID II." in answer


@pytest.mark.asyncio
async def test_no_turn1_only_one_streaming_call(base_kwargs):
    """The latency win: NO non-streaming decision turn, exactly ONE stream call,
    and we drive retrieval ourselves (search_knowledge) rather than asking Claude."""
    client = _FakeClient("Answer.")
    run_tool = _make_tool_runner("ctx")
    await _collect(run_agent(
        [{"role": "user", "content": "What is MiFID II?"}],
        client=client, run_tool=run_tool, **base_kwargs,
    ))
    assert client.messages.create_calls == []          # no Turn 1
    assert len(client.messages.stream_calls) == 1       # single synthesis call
    assert run_tool.calls and run_tool.calls[0][0] == "search_knowledge"
    # We embed the user's question directly.
    assert run_tool.calls[0][1]["query"] == "What is MiFID II?"


@pytest.mark.asyncio
async def test_retrieved_context_injected_into_system(base_kwargs):
    client = _FakeClient("Answer.")
    run_tool = _make_tool_runner("RETRIEVED_PASSAGE_XYZ")
    await _collect(run_agent(
        [{"role": "user", "content": "q"}],
        client=client, run_tool=run_tool, **base_kwargs,
    ))
    sys_arg = client.messages.stream_calls[0]["system"]
    assert "RETRIEVED_PASSAGE_XYZ" in sys_arg
    assert "SYS" in sys_arg  # base system prompt preserved


@pytest.mark.asyncio
async def test_acknowledgement_token_precedes_pipeline(base_kwargs):
    """An immediate token must reach Beyond Presence before retrieval so the
    avatar starts speaking inside BP's response window."""
    client = _FakeClient("Answer.")
    run_tool = _make_tool_runner("ctx")
    events = await _collect(run_agent(
        [{"role": "user", "content": "What is MiFID II?"}],
        client=client, run_tool=run_tool, **base_kwargs,
    ))
    types = [type(e).__name__ for e in events]
    assert types.index("Token") < types.index("ToolCall")


@pytest.mark.asyncio
async def test_stream_error_is_surfaced_not_swallowed(base_kwargs):
    """If synthesis streaming fails, the avatar must still say something and end."""
    client = _FakeClient("", stream_raises=RuntimeError("Event loop is closed"))
    run_tool = _make_tool_runner("ctx")
    events = await _collect(run_agent(
        [{"role": "user", "content": "What is MiFID II?"}],
        client=client, run_tool=run_tool, **base_kwargs,
    ))
    spoken = " ".join(e.text.lower() for e in events if isinstance(e, Token))
    assert "sorry" in spoken or "problem" in spoken
    assert isinstance(events[-1], MessageEnd)


@pytest.mark.asyncio
async def test_tool_failure_does_not_freeze_and_still_streams(base_kwargs):
    """A throwing retrieval (missing index / dim mismatch) must NOT propagate —
    synthesis still runs and the stream still terminates, never freezing."""
    client = _FakeClient("I could not reach the knowledge base.")

    def boom_tool(name, args, *, store, embedder, max_sensitivity):
        raise RuntimeError("There is no such vector schema index: chunk_vec")

    events = await _collect(run_agent(
        [{"role": "user", "content": "What is MiFID II?"}],
        client=client, run_tool=boom_tool, **base_kwargs,
    ))
    assert any(isinstance(e, ToolResult) for e in events)
    assert "".join(e.text for e in events if isinstance(e, Token))  # spoke something
    assert isinstance(events[-1], MessageEnd)


@pytest.mark.asyncio
async def test_greeting_fast_path_skips_everything(base_kwargs):
    """Greetings answer instantly: no client call, no retrieval."""
    run_tool = _make_tool_runner("ctx")
    events = await _collect(run_agent(
        [{"role": "user", "content": "hello"}],
        client=None, run_tool=run_tool, **base_kwargs,
    ))
    spoken = "".join(e.text for e in events if isinstance(e, Token))
    assert "SIX Corporate Advisor" in spoken
    assert not run_tool.calls
    assert not any(isinstance(e, ToolCall) for e in events)
    assert isinstance(events[-1], MessageEnd)


@pytest.mark.asyncio
async def test_farewell_fast_path_skips_retrieval_and_ack(base_kwargs):
    """Goodbyes/thanks answer instantly: no retrieval, and NO 'let me check' filler."""
    run_tool = _make_tool_runner("ctx")
    for closer in ("goodbye", "thanks!", "thank you", "that's all"):
        events = await _collect(run_agent(
            [{"role": "user", "content": closer}],
            client=None, run_tool=run_tool, **base_kwargs,
        ))
        spoken = "".join(e.text for e in events if isinstance(e, Token)).lower()
        assert "happy to help" in spoken
        assert "let me" not in spoken and "company brain" not in spoken
    assert not run_tool.calls



@pytest.mark.asyncio
async def test_citations_deduped_by_chunk_id(base_kwargs):
    client = _FakeClient("Answer.")
    run_tool = _make_tool_runner(
        "ctx", {"nodes": [], "edges": []},
        [
            {"chunk_id": "dup", "doc_title": "Doc", "sensitivity": "C2 Internal", "chunk_text": "x"},
            {"chunk_id": "dup", "doc_title": "Doc", "sensitivity": "C2 Internal", "chunk_text": "x"},
            {"chunk_id": "other", "doc_title": "Doc2", "sensitivity": "C2 Internal", "chunk_text": "y"},
        ],
    )
    events = await _collect(run_agent(
        [{"role": "user", "content": "q"}],
        client=client, run_tool=run_tool, **base_kwargs,
    ))
    cites = [e for e in events if isinstance(e, Citation)]
    assert len(cites) == 2  # deduped by chunk_id


# ── Voice splitter (sync) ────────────────────────────────────────────────────
def test_voice_splitter_single_chunk():
    from api.agent import _VoiceSplitter
    sp = _VoiceSplitter()
    out = sp.feed("[SPOKEN] Yes, it is covered. [DETAIL] # Answer\nFull body.")
    out += sp.flush()
    assert ("spoken", "Yes, it is covered.") in out
    detail = "".join(t for ch, t in out if ch == "detail")
    assert "# Answer" in detail and "Full body." in detail
    assert all(ch != "both" for ch, _ in out)


def test_voice_splitter_delimiter_split_across_chunks():
    from api.agent import _VoiceSplitter
    sp = _VoiceSplitter()
    a = sp.feed("[SPOKEN] Short summary. [DE")   # delimiter half-arrived
    b = sp.feed("TAIL] Detailed answer.")        # completes the delimiter
    out = a + b + sp.flush()
    assert a == []                               # nothing emitted while buffering
    assert ("spoken", "Short summary.") in out
    assert ("detail", "Detailed answer.") in out


def test_voice_splitter_streams_detail_after_switch():
    from api.agent import _VoiceSplitter
    sp = _VoiceSplitter()
    sp.feed("[SPOKEN] s. [DETAIL] one ")
    more = sp.feed("two three")
    assert more == [("detail", "two three")]


def test_voice_splitter_malformed_no_detail_is_both():
    from api.agent import _VoiceSplitter
    sp = _VoiceSplitter()
    assert sp.feed("[SPOKEN] Only a summary, model forgot the marker.") == []
    assert sp.flush() == [("both", "Only a summary, model forgot the marker.")]


def test_voice_splitter_tolerates_markdown_and_case_on_tags():
    from api.agent import _VoiceSplitter
    sp = _VoiceSplitter()
    out = sp.feed("**[Spoken]** Yes it is covered. **[Detail]**\n# Answer\nFull body.")
    out += sp.flush()
    assert ("spoken", "Yes it is covered.") in out
    detail = "".join(t for ch, t in out if ch == "detail")
    assert "# Answer" in detail and "Full body." in detail


def test_voice_splitter_does_not_split_on_the_word_detail_in_prose():
    from api.agent import _VoiceSplitter
    sp = _VoiceSplitter()
    # "detail" appears as a plain word in the spoken summary; only the bracketed
    # [DETAIL] tag should split.
    out = sp.feed("Here is more detail on that. [DETAIL] The full answer.")
    out += sp.flush()
    spoken = "".join(t for ch, t in out if ch == "spoken")
    detail = "".join(t for ch, t in out if ch == "detail")
    assert "more detail on that" in spoken
    assert detail == "The full answer."


# ── run_agent voice mode (async) ─────────────────────────────────────────────
@pytest.mark.asyncio
async def test_voice_mode_splits_spoken_and_detail(base_kwargs):
    client = _FakeClient(
        "[SPOKEN] Yes, that note is reportable and complex. "
        "[DETAIL] # Coverage\nThe instrument is **MiFIR-reportable**."
    )
    run_tool = _make_tool_runner("ctx")
    events = await _collect(run_agent(
        [{"role": "user", "content": "Is the note covered?"}],
        client=client, run_tool=run_tool, mode="voice", **base_kwargs,
    ))
    spoken = "".join(e.text for e in events
                     if isinstance(e, Token) and e.channel in ("spoken", "both"))
    detail = "".join(e.text for e in events
                     if isinstance(e, Token) and e.channel == "detail")
    assert "Yes, that note is reportable and complex." in spoken
    assert "MiFIR-reportable" in detail
    assert "MiFIR-reportable" not in spoken          # full answer not spoken
    assert "Coverage" not in spoken


@pytest.mark.asyncio
async def test_voice_mode_injects_output_format(base_kwargs):
    client = _FakeClient("[SPOKEN] s. [DETAIL] d.")
    run_tool = _make_tool_runner("ctx")
    await _collect(run_agent(
        [{"role": "user", "content": "q"}],
        client=client, run_tool=run_tool, mode="voice", **base_kwargs,
    ))
    sys_arg = client.messages.stream_calls[0]["system"]
    assert "[SPOKEN]" in sys_arg and "[DETAIL]" in sys_arg


@pytest.mark.asyncio
async def test_voice_mode_ack_is_spoken_channel(base_kwargs):
    client = _FakeClient("[SPOKEN] s. [DETAIL] d.")
    run_tool = _make_tool_runner("ctx")
    events = await _collect(run_agent(
        [{"role": "user", "content": "q"}],
        client=client, run_tool=run_tool, mode="voice", **base_kwargs,
    ))
    first_token = next(e for e in events if isinstance(e, Token))
    assert first_token.channel == "spoken"           # ack reaches avatar, not chat


@pytest.mark.asyncio
async def test_voice_mode_malformed_synthesis_is_both(base_kwargs):
    client = _FakeClient("Just a summary, no detail marker at all.")
    run_tool = _make_tool_runner("ctx")
    events = await _collect(run_agent(
        [{"role": "user", "content": "q"}],
        client=client, run_tool=run_tool, mode="voice", **base_kwargs,
    ))
    both = "".join(e.text for e in events
                   if isinstance(e, Token) and e.channel == "both")
    assert "Just a summary, no detail marker at all." in both


@pytest.mark.asyncio
async def test_voice_mode_greeting_is_both(base_kwargs):
    run_tool = _make_tool_runner("ctx")
    events = await _collect(run_agent(
        [{"role": "user", "content": "hello"}],
        client=None, run_tool=run_tool, mode="voice", **base_kwargs,
    ))
    greet_tokens = [e for e in events if isinstance(e, Token)]
    assert greet_tokens and all(e.channel == "both" for e in greet_tokens)
    assert "SIX Corporate Advisor" in "".join(e.text for e in greet_tokens)


@pytest.mark.asyncio
async def test_text_mode_unchanged_uses_full_channel(base_kwargs):
    client = _FakeClient("Plain text answer.")
    run_tool = _make_tool_runner("ctx")
    events = await _collect(run_agent(
        [{"role": "user", "content": "q"}],
        client=client, run_tool=run_tool, **base_kwargs,   # default mode="text"
    ))
    assert all(e.channel == "full" for e in events if isinstance(e, Token))
    sys_arg = client.messages.stream_calls[0]["system"]
    assert "[SPOKEN]" not in sys_arg
    assert "Plain text answer." in "".join(e.text for e in events if isinstance(e, Token))
