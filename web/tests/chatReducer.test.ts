import { describe, it, expect } from "vitest";
import { initialState, reduce } from "@/lib/chatReducer";
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
});
