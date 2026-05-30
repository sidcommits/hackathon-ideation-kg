"use client";
import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { GraphState } from "@/lib/chatReducer";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const COLOR: Record<string, string> = {
  Regulation: "#34d399",     // green — backbone
  DataAttribute: "#34d399",
  InstrumentType: "#34d399",
  Obligation: "#60a5fa",     // blue — reasoning
  Concept: "#60a5fa",
  Insight: "#60a5fa",
  Document: "#c084fc",       // purple — provenance
  Chunk: "#c084fc",
};

export function GraphCanvas({ graph }: { graph: GraphState }) {
  const data = useMemo(
    () => ({
      nodes: graph.nodes.map((n) => ({ id: n.id, label: n.label, name: n.name ?? n.title ?? n.id })),
      links: graph.edges.map((e) => ({ source: e.from, target: e.to, rel: e.rel })),
    }),
    [graph.nodes, graph.edges],
  );
  const pulsed = useMemo(() => new Set(graph.pulsedIds), [graph.pulsedIds]);

  return (
    <ForceGraph2D
      graphData={data}
      backgroundColor="#0A0B0D"
      nodeRelSize={5}
      linkColor={() => "rgba(148,163,184,0.25)"}
      linkDirectionalParticles={1}
      nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
        const color = COLOR[node.label] ?? "#94a3b8";
        const r = pulsed.has(node.id) ? 7 : 4;
        if (pulsed.has(node.id)) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 5, 0, 2 * Math.PI);
          ctx.fillStyle = color + "33";
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        if (scale > 1.5) {
          ctx.font = `${10 / scale}px sans-serif`;
          ctx.fillStyle = "#cbd5e1";
          ctx.fillText(node.name, node.x + r + 1, node.y + 3);
        }
      }}
    />
  );
}
