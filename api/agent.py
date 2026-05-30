import asyncio
import re

from anthropic import Anthropic

from api import tools as tools_mod
from api.events import (
    Citation, MessageEnd, MessageStart, Token, ToolCall, ToolResult,
)

MAX_TURNS = 6

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


def _chunk_text(text: str, size: int = 24):
    for i in range(0, len(text), size):
        yield text[i:i + size]


async def _stream_claude(client, params: dict, token_queue: asyncio.Queue):
    """Thread target: stream Claude tokens into token_queue in real time."""
    loop = asyncio.get_event_loop()
    collected_content = []
    stop_reason = "end_turn"
    try:
        with client.messages.stream(**params) as stream:
            for text_chunk in stream.text_stream:
                loop.call_soon_threadsafe(token_queue.put_nowait, ("token", text_chunk))
            final = stream.get_final_message()
            stop_reason = final.stop_reason or "end_turn"
            for block in final.content:
                btype = getattr(block, "type", None)
                if btype == "text":
                    collected_content.append({"type": "text", "text": block.text})
                elif btype == "tool_use":
                    collected_content.append({
                        "type": "tool_use", "id": block.id,
                        "name": block.name, "input": block.input,
                    })
    except Exception as exc:
        loop.call_soon_threadsafe(token_queue.put_nowait, ("error", str(exc)))
    finally:
        loop.call_soon_threadsafe(
            token_queue.put_nowait, ("done", (stop_reason, collected_content))
        )


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
    """Drive a Claude tool-use loop, yielding typed Events.

    Latency architecture for Beyond Presence avatar:
    - Greeting fast-path  → < 0.5 s, no LLM call.
    - First turn          → non-streaming (must inspect tool_use blocks).
    - After tool results  → always streaming so BP gets first token in 2-3 s.
    """
    convo = list(messages)
    seen_chunks: set[str] = set()
    pending_citations: list[Citation] = []
    tools_executed = False  # flag: have we run at least one tool round?

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

    stop_reason = "max_turns"

    for _turn in range(MAX_TURNS):

        if tools_executed:
            # ── After tool results: stream the answer in real-time ────────────
            # Build snapshot AFTER tool_results are in convo.
            # No 'tools' param → forces Claude to synthesise a text answer.
            stream_params = dict(
                model=model,
                max_tokens=2048,
                system=system,
                messages=list(convo),
            )

            loop = asyncio.get_event_loop()
            token_queue: asyncio.Queue = asyncio.Queue()
            fut = loop.run_in_executor(
                None, _sync_stream_wrapper, client, stream_params, token_queue, loop
            )

            final_content = []
            final_stop = "end_turn"
            while True:
                kind, payload = await token_queue.get()
                if kind == "token":
                    yield Token(text=payload)
                elif kind == "error":
                    break
                elif kind == "done":
                    final_stop, final_content = payload
                    break

            await fut

            convo.append({"role": "assistant", "content": final_content})
            stop_reason = final_stop
            # If the synthesis also triggered tool_use (very rare), loop
            tool_uses_in_answer = [b for b in final_content if b.get("type") == "tool_use"]
            if not tool_uses_in_answer:
                break
            # Else continue loop to handle those tool calls next turn
            tools_executed = False  # reset so we run non-streaming to inspect
            assistant_content = final_content
            tool_uses_raw = tool_uses_in_answer
        else:
            # ── First (or non-tool) turn: non-streaming to inspect response ───
            msg = await asyncio.to_thread(
                client.messages.create,
                model=model,
                max_tokens=2048,
                system=system,
                tools=tools_mod.TOOL_SCHEMAS,
                messages=convo,
            )

            assistant_content = []
            tool_uses_raw = []

            for block in msg.content:
                btype = getattr(block, "type", None)
                if btype == "text":
                    assistant_content.append({"type": "text", "text": block.text})
                    for piece in _chunk_text(block.text):
                        yield Token(text=piece)
                elif btype == "tool_use":
                    assistant_content.append(
                        {"type": "tool_use", "id": block.id,
                         "name": block.name, "input": block.input}
                    )
                    tool_uses_raw.append(block)

            convo.append({"role": "assistant", "content": assistant_content})

            if msg.stop_reason != "tool_use" or not tool_uses_raw:
                stop_reason = msg.stop_reason or "end_turn"
                break

        # ── Execute tools ─────────────────────────────────────────────────────
        tool_results_block = []
        for tu in tool_uses_raw:
            tu_id = tu.id if hasattr(tu, "id") else tu["id"]
            tu_name = tu.name if hasattr(tu, "name") else tu["name"]
            tu_input = dict(tu.input) if hasattr(tu, "input") else tu["input"]
            yield ToolCall(id=tu_id, name=tu_name, args=tu_input)
            model_result, delta, citations = await asyncio.to_thread(
                run_tool,
                tu_name, tu_input,
                store=store, embedder=embedder, max_sensitivity=max_sensitivity,
            )
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
            tool_results_block.append({
                "type": "tool_result", "tool_use_id": tu_id, "content": model_result,
            })

        convo.append({"role": "user", "content": tool_results_block})
        tools_executed = True  # next iteration will stream the answer

    for c in pending_citations:
        yield c
    yield MessageEnd(stop_reason=stop_reason)


def _sync_stream_wrapper(client, params, token_queue, loop):
    """Synchronous wrapper around the streaming SDK call, run in a thread."""
    collected_content = []
    stop_reason = "end_turn"
    try:
        with client.messages.stream(**params) as stream:
            for text_chunk in stream.text_stream:
                loop.call_soon_threadsafe(token_queue.put_nowait, ("token", text_chunk))
            final = stream.get_final_message()
            stop_reason = final.stop_reason or "end_turn"
            for block in final.content:
                btype = getattr(block, "type", None)
                if btype == "text":
                    collected_content.append({"type": "text", "text": block.text})
                elif btype == "tool_use":
                    collected_content.append({
                        "type": "tool_use", "id": block.id,
                        "name": block.name, "input": block.input,
                    })
    except Exception as exc:
        loop.call_soon_threadsafe(token_queue.put_nowait, ("error", str(exc)))
    finally:
        loop.call_soon_threadsafe(
            token_queue.put_nowait, ("done", (stop_reason, collected_content))
        )


def make_client(api_key: str) -> Anthropic:
    return Anthropic(api_key=api_key)
