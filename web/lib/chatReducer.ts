import type { ChatEvent, GraphNode, GraphEdge } from "@/lib/events";

export type Citation = { doc_title: string; sensitivity: string; chunk_text: string };
// Per-answer subgraph: the nodes/edges THIS answer traversed (for the Sources panel).
export type MessageSubgraph = { nodes: GraphNode[]; edges: GraphEdge[] };
export type Message = {
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
  subgraph?: MessageSubgraph;
  // Tool trace for THIS turn, attached to the message so it renders with its
  // answer regardless of the ephemeral activeToolCalls list or isLast gating
  // (the voice mirror arrives async via SSE and can race that global list).
  toolCalls?: ToolCard[];
};
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
    case "init_graph":
      return {
        ...state,
        graph: {
          nodes: event.graph.nodes,
          edges: event.graph.edges,
          pulsedIds: [],
        },
      };

    case "message_start":
      return { ...state, messages: ensureAssistant(state.messages) };

    case "token": {
      const messages = ensureAssistant(state.messages);
      const idx = messages.length - 1;
      const updated = { ...messages[idx], text: messages[idx].text + event.text };
      return { ...state, messages: [...messages.slice(0, idx), updated] };
    }

    case "tool_call": {
      // Tool ids are stable within a turn but can repeat across turns (the agent
      // uses a constant id for search_knowledge). Upsert by id so a re-delivered
      // or reordered tool_call never produces two cards with the same React key.
      if (state.activeToolCalls.some((c) => c.id === event.id)) return state;
      const card: ToolCard = {
        id: event.id, name: event.name, args: event.args, status: "running",
      };
      const messages = ensureAssistant(state.messages);
      const idx = messages.length - 1;
      const cur = messages[idx];
      const updated: Message = { ...cur, toolCalls: [...(cur.toolCalls ?? []), card] };
      return {
        ...state,
        activeToolCalls: [...state.activeToolCalls, card],
        messages: [...messages.slice(0, idx), updated],
      };
    }

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

      // Also accumulate this delta onto the current answer's own subgraph so the
      // Sources & Relations panel can show what THIS answer traversed.
      const messages = ensureAssistant(state.messages);
      const idx = messages.length - 1;
      const cur = messages[idx];
      const subNodeById = new Map((cur.subgraph?.nodes ?? []).map((n) => [n.id, n]));
      for (const n of event.graph_delta.nodes) subNodeById.set(n.id, n);
      const subEdgeSet = new Map(
        (cur.subgraph?.edges ?? []).map((e) => [edgeKey(e), e]),
      );
      for (const e of event.graph_delta.edges) subEdgeSet.set(edgeKey(e), e);
      const updatedMsg: Message = {
        ...cur,
        subgraph: { nodes: [...subNodeById.values()], edges: [...subEdgeSet.values()] },
        toolCalls: (cur.toolCalls ?? []).map((c) =>
          c.id === event.id ? { ...c, status: "done" as const, summary: event.summary } : c,
        ),
      };

      return {
        ...state,
        activeToolCalls,
        messages: [...messages.slice(0, idx), updatedMsg],
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

    case "user_transcript":
      return {
        ...state,
        messages: [...state.messages, { role: "user", text: event.text }],
        activeToolCalls: [],
        graph: { ...state.graph, pulsedIds: [] },
      };

    case "mirror_turn": {
      // One complete voice turn, atomic: append a user bubble + a fully-formed
      // assistant bubble (answer + citations + subgraph). No streaming, so it
      // can't interleave with other turns. Merge the subgraph into the live graph.
      const byId = new Map(state.graph.nodes.map((n) => [n.id, n]));
      const pulsed: string[] = [];
      for (const n of event.graph_delta.nodes) {
        if (!byId.has(n.id)) pulsed.push(n.id);
        byId.set(n.id, n);
      }
      const edgeKey = (e: GraphEdge) => `${e.from}|${e.rel}|${e.to}`;
      const edgeSet = new Map(state.graph.edges.map((e) => [edgeKey(e), e]));
      for (const e of event.graph_delta.edges) edgeSet.set(edgeKey(e), e);

      const userMsg: Message = { role: "user", text: event.question };
      const assistantMsg: Message = {
        role: "assistant",
        text: event.answer,
        citations: event.citations,
        subgraph: { nodes: event.graph_delta.nodes, edges: event.graph_delta.edges },
      };
      return {
        ...state,
        messages: [...state.messages, userMsg, assistantMsg],
        activeToolCalls: [],
        graph: { nodes: [...byId.values()], edges: [...edgeSet.values()], pulsedIds: pulsed },
      };
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
