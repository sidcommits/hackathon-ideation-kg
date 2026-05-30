import asyncio

from api.agent import run_agent
from api.events import MessageStart, Token, ToolCall, ToolResult, Citation, MessageEnd


class _Block:
    def __init__(self, **kw):
        self.__dict__.update(kw)


class _FakeMessage:
    """Mimics anthropic Message: .content (list of blocks) + .stop_reason."""
    def __init__(self, content, stop_reason):
        self.content = content
        self.stop_reason = stop_reason


class _FakeMessages:
    """First call -> tool_use; second call -> final text."""
    def __init__(self):
        self._calls = 0

    def create(self, **kw):
        self._calls += 1
        if self._calls == 1:
            return _FakeMessage(
                [_Block(type="tool_use", id="tc_1", name="search_knowledge",
                        input={"query": "structured note"})],
                stop_reason="tool_use",
            )
        return _FakeMessage(
            [_Block(type="text", text="A structured note is complex under MiFID II.")],
            stop_reason="end_turn",
        )


class _FakeClient:
    def __init__(self):
        self.messages = _FakeMessages()


def _fake_run_tool(name, args, **kw):
    return ("ESMA passage about structured notes",
            {"nodes": [{"id": "Chunk:c1", "label": "Chunk"}], "edges": []},
            [{"doc_title": "ESMA", "doc_id": "d1", "chunk_id": "c1",
              "sensitivity": "C2 Internal", "chunk_text": "..."}])


def _collect(messages, **kw):
    async def go():
        return [e async for e in run_agent(messages, **kw)]
    return asyncio.run(go())


def test_agent_emits_well_formed_sequence():
    events = _collect(
        [{"role": "user", "content": "is a structured note complex?"}],
        client=_FakeClient(), run_tool=_fake_run_tool,
        store=None, embedder=None, max_sensitivity="C2 Internal",
        model="claude-test", system="sys",
    )
    types = [e.type for e in events]
    assert types[0] == "message_start"
    assert types[-1] == "message_end"
    assert "tool_call" in types and "tool_result" in types and "token" in types
    tr = next(e for e in events if e.type == "tool_result")
    assert tr.graph_delta["nodes"][0]["id"] == "Chunk:c1"
    assert "citation" in types
    assert types.index("citation") < types.index("message_end")


def test_agent_dedupes_citations_by_chunk_id():
    events = _collect(
        [{"role": "user", "content": "q"}],
        client=_FakeClient(), run_tool=_fake_run_tool,
        store=None, embedder=None, max_sensitivity="C2 Internal",
        model="claude-test", system="sys",
    )
    cites = [e for e in events if e.type == "citation"]
    assert len({c.chunk_text for c in cites}) == len(cites)


class _AlwaysToolMessages:
    def create(self, **kw):
        class _B:
            type = "tool_use"; id = "tc"; name = "search_knowledge"; input = {"query": "x"}
        class _M:
            content = [_B()]; stop_reason = "tool_use"
        return _M()


class _AlwaysToolClient:
    def __init__(self):
        self.messages = _AlwaysToolMessages()


def test_agent_marks_max_turns_exhaustion():
    events = _collect(
        [{"role": "user", "content": "loop forever"}],
        client=_AlwaysToolClient(), run_tool=_fake_run_tool,
        store=None, embedder=None, max_sensitivity="C2 Internal",
        model="claude-test", system="sys",
    )
    assert events[0].type == "message_start"
    end = events[-1]
    assert end.type == "message_end"
    assert end.stop_reason == "max_turns"
