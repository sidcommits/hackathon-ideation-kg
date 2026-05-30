from anthropic import Anthropic

from api import tools as tools_mod
from api.events import (
    Citation, MessageEnd, MessageStart, Token, ToolCall, ToolResult,
)

MAX_TURNS = 6


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
    """Drive a Claude tool-use loop, yielding typed Events. `client` and `run_tool`
    are injected so the loop is unit-testable without network or Neo4j."""
    convo = list(messages)
    seen_chunks: set[str] = set()
    pending_citations: list[Citation] = []

    yield MessageStart(id="msg")

    for _turn in range(MAX_TURNS):
        msg = client.messages.create(
            model=model,
            max_tokens=2048,
            system=system,
            tools=tools_mod.TOOL_SCHEMAS,
            messages=convo,
        )

        assistant_content = []
        tool_uses = []
        for block in msg.content:
            btype = getattr(block, "type", None)
            if btype == "text":
                assistant_content.append({"type": "text", "text": block.text})
                for piece in _chunk_text(block.text):
                    yield Token(text=piece)
            elif btype == "tool_use":
                assistant_content.append(
                    {"type": "tool_use", "id": block.id, "name": block.name, "input": block.input}
                )
                tool_uses.append(block)

        convo.append({"role": "assistant", "content": assistant_content})

        if msg.stop_reason != "tool_use" or not tool_uses:
            break

        tool_results_block = []
        for tu in tool_uses:
            yield ToolCall(id=tu.id, name=tu.name, args=dict(tu.input))
            model_result, delta, citations = run_tool(
                tu.name, dict(tu.input),
                store=store, embedder=embedder, max_sensitivity=max_sensitivity,
            )
            summary = model_result.splitlines()[0][:120] if model_result else "no result"
            yield ToolResult(id=tu.id, summary=summary, graph_delta=delta)
            for c in citations:
                if c["chunk_id"] in seen_chunks:
                    continue
                seen_chunks.add(c["chunk_id"])
                pending_citations.append(Citation(
                    doc_title=c["doc_title"], sensitivity=c["sensitivity"],
                    chunk_text=c["chunk_text"],
                ))
            tool_results_block.append({
                "type": "tool_result", "tool_use_id": tu.id, "content": model_result,
            })
        convo.append({"role": "user", "content": tool_results_block})

    for c in pending_citations:
        yield c
    yield MessageEnd(stop_reason="end_turn")


def make_client(api_key: str) -> Anthropic:
    return Anthropic(api_key=api_key)
