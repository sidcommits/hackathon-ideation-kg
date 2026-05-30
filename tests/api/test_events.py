import json
from api.events import (
    MessageStart, Token, ToolCall, ToolResult, Citation, MessageEnd, ErrorEvent,
    UserTranscript, sse,
)


def test_token_serializes_to_sse_frame():
    frame = sse(Token(text="hello"))
    assert frame == 'data: {"type":"token","text":"hello","channel":"full"}\n\n'


def test_token_channel_defaults_to_full_and_accepts_values():
    assert Token(text="x").channel == "full"
    assert Token(text="x", channel="spoken").channel == "spoken"
    assert Token(text="x", channel="detail").channel == "detail"
    assert Token(text="x", channel="both").channel == "both"


def test_user_transcript_event_serializes():
    ev = UserTranscript(text="Are structured notes covered?")
    dumped = ev.model_dump()
    assert dumped["type"] == "user_transcript"
    assert dumped["text"] == "Are structured notes covered?"


def test_tool_result_carries_graph_delta():
    ev = ToolResult(
        id="tc_1",
        summary="5 chunks",
        graph_delta={"nodes": [{"id": "Reg:MiFID II", "label": "Regulation"}], "edges": []},
    )
    payload = json.loads(sse(ev).removeprefix("data: ").strip())
    assert payload["type"] == "tool_result"
    assert payload["graph_delta"]["nodes"][0]["id"] == "Reg:MiFID II"


def test_citation_includes_sensitivity():
    ev = Citation(doc_title="ESMA", sensitivity="C2 Internal", chunk_text="...")
    payload = json.loads(sse(ev).removeprefix("data: ").strip())
    assert payload["sensitivity"] == "C2 Internal"


def test_all_events_have_distinct_type_literals():
    types = {
        MessageStart(id="m").type, Token(text="x").type, ToolCall(id="t", name="n", args={}).type,
        ToolResult(id="t", summary="s", graph_delta={"nodes": [], "edges": []}).type,
        Citation(doc_title="d", sensitivity="C2 Internal", chunk_text="c").type,
        MessageEnd(stop_reason="end_turn").type, ErrorEvent(message="e").type,
        UserTranscript(text="u").type,
    }
    assert types == {"message_start", "token", "tool_call", "tool_result",
                     "citation", "message_end", "error", "user_transcript"}
