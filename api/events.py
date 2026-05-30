from typing import Literal, Union

from pydantic import BaseModel


class MessageStart(BaseModel):
    type: Literal["message_start"] = "message_start"
    id: str


class Token(BaseModel):
    type: Literal["token"] = "token"
    text: str
    channel: Literal["full", "spoken", "detail", "both"] = "full"


class ToolCall(BaseModel):
    type: Literal["tool_call"] = "tool_call"
    id: str
    name: str
    args: dict


class GraphDelta(BaseModel):
    nodes: list[dict] = []
    edges: list[dict] = []


class ToolResult(BaseModel):
    type: Literal["tool_result"] = "tool_result"
    id: str
    summary: str
    graph_delta: dict | GraphDelta = GraphDelta()


class Citation(BaseModel):
    type: Literal["citation"] = "citation"
    doc_title: str
    sensitivity: str
    chunk_text: str


class MessageEnd(BaseModel):
    type: Literal["message_end"] = "message_end"
    stop_reason: str


class UserTranscript(BaseModel):
    type: Literal["user_transcript"] = "user_transcript"
    text: str


class MirrorTurn(BaseModel):
    """One COMPLETE voice turn, mirrored atomically into the web chat: the user's
    transcribed question plus the full detailed answer + citations. Delivered as a
    single event (not a token stream) so concurrent/overlapping turns can never
    interleave into one scrambled bubble."""
    type: Literal["mirror_turn"] = "mirror_turn"
    question: str
    answer: str
    citations: list[dict] = []
    graph_delta: dict | GraphDelta = GraphDelta()


class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str


Event = Union[
    MessageStart, Token, ToolCall, ToolResult, Citation, MessageEnd,
    UserTranscript, MirrorTurn, ErrorEvent,
]


def sse(event: BaseModel) -> str:
    """Serialize one event as a single SSE `data:` frame (compact JSON, no spaces)."""
    return f"data: {event.model_dump_json()}\n\n"
