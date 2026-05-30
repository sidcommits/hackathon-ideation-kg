export type GraphNode = { id: string; label: string; name?: string; title?: string };
export type GraphEdge = { from: string; to: string; rel: string };
export type GraphDelta = { nodes: GraphNode[]; edges: GraphEdge[] };

export type ChatEvent =
  | { type: "init_graph"; graph: GraphDelta }
  | { type: "message_start"; id: string }
  | { type: "token"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; id: string; summary: string; graph_delta: GraphDelta }
  | { type: "citation"; doc_title: string; sensitivity: string; chunk_text: string }
  | { type: "message_end"; stop_reason: string }
  | { type: "error"; message: string };
