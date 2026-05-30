import type { ChatEvent, GraphNode, GraphEdge } from "@/lib/events";

export type Citation = { doc_title: string; sensitivity: string; chunk_text: string };
export type Message = { role: "user" | "assistant"; text: string; citations?: Citation[] };
export type ToolCard = {
  id: string; name: string; args: Record<string, unknown>;
  status: "running" | "done"; summary?: string;
};
export type GraphState = { nodes: GraphNode[]; edges: GraphEdge[]; pulsedIds: string[] };
export type ChatState = {
  messages: Message[];
  activeToolCalls: ToolCard[];
  graph: GraphState;
};

export const initialState = (): ChatState => ({
  messages: [],
  activeToolCalls: [],
  graph: { nodes: [], edges: [], pulsedIds: [] },
});

function ensureAssistant(messages: Message[]): Message[] {
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant") return messages;
  return [...messages, { role: "assistant", text: "", citations: [] }];
}

export function appendUser(state: ChatState, text: string): ChatState {
  return {
    ...state,
    messages: [...state.messages, { role: "user", text }],
    activeToolCalls: [],
    graph: { ...state.graph, pulsedIds: [] },
  };
}

export function reduce(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case "message_start":
      return { ...state, messages: ensureAssistant(state.messages) };

    case "token": {
      const messages = ensureAssistant(state.messages);
      const idx = messages.length - 1;
      const updated = { ...messages[idx], text: messages[idx].text + event.text };
      return { ...state, messages: [...messages.slice(0, idx), updated] };
    }

    case "tool_call":
      return {
        ...state,
        activeToolCalls: [
          ...state.activeToolCalls,
          { id: event.id, name: event.name, args: event.args, status: "running" },
        ],
      };

    case "tool_result": {
      const activeToolCalls = state.activeToolCalls.map((c) =>
        c.id === event.id ? { ...c, status: "done" as const, summary: event.summary } : c,
      );
      const byId = new Map(state.graph.nodes.map((n) => [n.id, n]));
      const pulsed: string[] = [];
      for (const n of event.graph_delta.nodes) {
        if (!byId.has(n.id)) pulsed.push(n.id);
        byId.set(n.id, n);
      }
      const edgeKey = (e: GraphEdge) => `${e.from}|${e.rel}|${e.to}`;
      const edgeSet = new Map(state.graph.edges.map((e) => [edgeKey(e), e]));
      for (const e of event.graph_delta.edges) edgeSet.set(edgeKey(e), e);
      return {
        ...state,
        activeToolCalls,
        graph: {
          nodes: [...byId.values()],
          edges: [...edgeSet.values()],
          pulsedIds: pulsed,
        },
      };
    }

    case "citation": {
      const messages = ensureAssistant(state.messages);
      const idx = messages.length - 1;
      const cur = messages[idx];
      const updated = {
        ...cur,
        citations: [
          ...(cur.citations ?? []),
          { doc_title: event.doc_title, sensitivity: event.sensitivity, chunk_text: event.chunk_text },
        ],
      };
      return { ...state, messages: [...messages.slice(0, idx), updated] };
    }

    case "error": {
      const messages = ensureAssistant(state.messages);
      const idx = messages.length - 1;
      const cur = messages[idx];
      const updated = { ...cur, text: cur.text + `\n\n⚠️ Error: ${event.message}` };
      return { ...state, messages: [...messages.slice(0, idx), updated] };
    }

    case "message_end":
    default:
      return state;
  }
}
