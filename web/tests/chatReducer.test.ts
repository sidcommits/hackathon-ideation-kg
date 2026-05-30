import { describe, it, expect } from "vitest";
import { initialState, reduce, appendUser } from "@/lib/chatReducer";
import type { ChatEvent } from "@/lib/events";

const feed = (events: ChatEvent[]) =>
  events.reduce((s, e) => reduce(s, e), initialState());

describe("chatReducer", () => {
  it("appends tokens into the active assistant message", () => {
    const s = feed([
      { type: "message_start", id: "m1" },
      { type: "token", text: "Hello " },
      { type: "token", text: "world" },
    ]);
    const last = s.messages[s.messages.length - 1];
    expect(last.role).toBe("assistant");
    expect(last.text).toBe("Hello world");
  });

  it("spawns a tool card on tool_call and resolves it on tool_result", () => {
    const s = feed([
      { type: "message_start", id: "m1" },
      { type: "tool_call", id: "tc1", name: "search_knowledge", args: { query: "x" } },
      { type: "tool_result", id: "tc1", summary: "5 chunks",
        graph_delta: { nodes: [{ id: "Chunk:c1", label: "Chunk" }], edges: [] } },
    ]);
    const card = s.activeToolCalls.find((c) => c.id === "tc1")!;
    expect(card.name).toBe("search_knowledge");
    expect(card.status).toBe("done");
    expect(card.summary).toBe("5 chunks");
  });

  it("does not create duplicate tool cards when a tool_call id repeats", () => {
    const s = feed([
      { type: "message_start", id: "m1" },
      { type: "tool_call", id: "call_search_knowledge", name: "search_knowledge", args: { query: "a" } },
      { type: "tool_call", id: "call_search_knowledge", name: "search_knowledge", args: { query: "a" } },
    ]);
    expect(s.activeToolCalls.filter((c) => c.id === "call_search_knowledge")).toHaveLength(1);
  });

  it("attaches tool calls to the assistant message and resolves them on tool_result", () => {
    const s = feed([
      { type: "message_start", id: "m1" },
      { type: "tool_call", id: "call_search_knowledge", name: "search_knowledge", args: { query: "x" } },
      { type: "tool_result", id: "call_search_knowledge", summary: "5 chunks",
        graph_delta: { nodes: [], edges: [] } },
    ]);
    const last = s.messages[s.messages.length - 1];
    expect(last.role).toBe("assistant");
    expect(last.toolCalls).toHaveLength(1);
    expect(last.toolCalls![0].status).toBe("done");
    expect(last.toolCalls![0].summary).toBe("5 chunks");
  });

  it("merges graph deltas and flags newly-arrived nodes as pulsed", () => {
    const s = feed([
      { type: "tool_result", id: "tc1", summary: "",
        graph_delta: { nodes: [{ id: "Reg:MiFID II", label: "Regulation" }],
                       edges: [{ from: "Reg:MiFID II", to: "Chunk:c1", rel: "MENTIONED_IN" }] } },
    ]);
    expect(s.graph.nodes.map((n) => n.id)).toContain("Reg:MiFID II");
    expect(s.graph.edges).toHaveLength(1);
    expect(s.graph.pulsedIds).toContain("Reg:MiFID II");
  });

  it("dedupes nodes across deltas by id", () => {
    const delta = { type: "tool_result" as const, id: "t", summary: "",
      graph_delta: { nodes: [{ id: "Reg:MiFID II", label: "Regulation" }], edges: [] } };
    const s = feed([delta, { ...delta, id: "t2" }]);
    expect(s.graph.nodes.filter((n) => n.id === "Reg:MiFID II")).toHaveLength(1);
  });

  it("collects citations", () => {
    const s = feed([
      { type: "citation", doc_title: "ESMA", sensitivity: "C2 Internal", chunk_text: "..." },
    ]);
    expect(s.messages.some((m) => m.citations && m.citations.length === 1)).toBe(true);
  });

  it("clears tool cards and pulses when a new user turn starts", () => {
    let s = feed([
      { type: "message_start", id: "m1" },
      { type: "tool_call", id: "tc1", name: "search_knowledge", args: {} },
      { type: "tool_result", id: "tc1", summary: "done",
        graph_delta: { nodes: [{ id: "Reg:MiFID II", label: "Regulation" }], edges: [] } },
    ]);
    expect(s.activeToolCalls).toHaveLength(1);
    expect(s.graph.pulsedIds).toContain("Reg:MiFID II");
    s = appendUser(s, "a follow-up question");
    expect(s.activeToolCalls).toHaveLength(0);
    expect(s.graph.pulsedIds).toHaveLength(0);
    // the accumulated graph node is retained across turns
    expect(s.graph.nodes.map((n) => n.id)).toContain("Reg:MiFID II");
  });

  it("appends a user bubble on user_transcript and clears tool cards/pulses", () => {
    let s = feed([
      { type: "message_start", id: "m1" },
      { type: "tool_call", id: "tc1", name: "search_knowledge", args: {} },
    ]);
    s = reduce(s, { type: "user_transcript", text: "Is the note covered?" });
    const last = s.messages[s.messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.text).toBe("Is the note covered?");
    expect(s.activeToolCalls).toHaveLength(0);
    expect(s.graph.pulsedIds).toHaveLength(0);
  });

  it("renders a mirrored voice turn: user_transcript then detail tokens", () => {
    const s = feed([
      { type: "user_transcript", text: "What is SFDR?" },
      { type: "message_start", id: "m2" },
      { type: "token", text: "SFDR ", channel: "detail" },
      { type: "token", text: "is a disclosure regulation.", channel: "detail" },
      { type: "message_end", stop_reason: "end_turn" },
    ]);
    expect(s.messages[0]).toMatchObject({ role: "user", text: "What is SFDR?" });
    const assistant = s.messages[1];
    expect(assistant.role).toBe("assistant");
    expect(assistant.text).toBe("SFDR is a disclosure regulation.");
  });

  it("renders an error event into the assistant message", () => {
    const s = feed([
      { type: "message_start", id: "m1" },
      { type: "token", text: "partial answer" },
      { type: "error", message: "Neo4j unavailable" },
    ]);
    const last = s.messages[s.messages.length - 1];
    expect(last.role).toBe("assistant");
    expect(last.text).toContain("partial answer");
    expect(last.text).toContain("Neo4j unavailable");
  });
});
