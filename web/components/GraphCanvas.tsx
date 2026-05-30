"use client";
import React, { useEffect, useMemo, useRef, useState, Component, ErrorInfo, ReactNode } from "react";
import dynamic from "next/dynamic";
import type { GraphState } from "@/lib/chatReducer";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

function GraphFallback({ graph }: { graph: GraphState }) {
  const empty = graph.nodes.length === 0;

  return (
    <div className="flex h-full w-full flex-col p-6 bg-[color:var(--bg)] text-left">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--fg-3)] mb-4">
        Knowledge Map (Accessibility View)
      </span>
      {empty ? (
        <div className="flex-1 flex items-center justify-center text-center px-4">
          <p className="max-w-[220px] text-[12px] leading-relaxed text-[color:var(--fg-3)]">
            As the brain reasons, the entities and sources it traverses light up here — a live map of what it knows.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-2 select-text pointer-events-auto">
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--fg-3)] mb-2">
              Discovered Entities ({graph.nodes.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {graph.nodes.map((n) => {
                const colors: Record<string, string> = {
                  Regulation: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
                  DataAttribute: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
                  InstrumentType: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
                  Obligation: "border-blue-500/20 bg-blue-500/5 text-blue-400",
                  Concept: "border-blue-500/20 bg-blue-500/5 text-blue-400",
                  Insight: "border-blue-500/20 bg-blue-500/5 text-blue-400",
                  Document: "border-purple-500/20 bg-purple-500/5 text-purple-400",
                  Chunk: "border-purple-500/20 bg-purple-500/5 text-purple-400",
                };
                const cls = colors[n.label] ?? "border-[color:var(--line)] bg-[color:var(--bg-2)] text-[color:var(--fg-2)]";
                return (
                  <span key={n.id} className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${cls}`}>
                    {n.name ?? n.title ?? n.id}
                  </span>
                );
              })}
            </div>
          </div>

          {graph.edges.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--fg-3)] mb-2">
                Active Relations ({graph.edges.length})
              </h4>
              <div className="flex flex-col gap-1.5">
                {graph.edges.map((e, idx) => {
                  const fromName = e.from.split(":", 2)[1] || e.from;
                  const toName = e.to.split(":", 2)[1] || e.to;
                  return (
                    <div key={idx} className="flex items-center gap-2 text-xs text-[color:var(--fg-2)]">
                      <span className="font-medium truncate max-w-[120px]">{fromName}</span>
                      <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-[color:var(--fg-3)] px-1.5 py-0.5 rounded border border-[color:var(--line)] bg-[color:var(--bg-2)]">
                        {e.rel}
                      </span>
                      <span className="font-medium truncate max-w-[120px]">{toName}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Semantic palette — must match globals.css node vars + the legend below. */
const BACKBONE = "#34D399"; // green  — Regulation / DataAttribute / InstrumentType
const REASONING = "#60A5FA"; // blue   — Obligation / Concept / Insight
const PROVENANCE = "#C084FC"; // purple — Document / Chunk

const COLOR: Record<string, string> = {
  Regulation: BACKBONE,
  DataAttribute: BACKBONE,
  InstrumentType: BACKBONE,
  Obligation: REASONING,
  Concept: REASONING,
  Insight: REASONING,
  Document: PROVENANCE,
  Chunk: PROVENANCE,
};

const LEGEND: { label: string; color: string; kinds: string }[] = [
  { label: "Backbone", color: BACKBONE, kinds: "Regulation · Attribute · Instrument" },
  { label: "Reasoning", color: REASONING, kinds: "Obligation · Concept · Insight" },
  { label: "Provenance", color: PROVENANCE, kinds: "Document · Chunk" },
];

export function GraphCanvas({ graph }: { graph: GraphState }) {
  const data = useMemo(
    () => ({
      nodes: graph.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        name: n.name ?? n.title ?? n.id,
      })),
      links: graph.edges.map((e) => ({ source: e.from, target: e.to, rel: e.rel })),
    }),
    [graph.nodes, graph.edges],
  );
  const pulsed = useMemo(() => new Set(graph.pulsedIds), [graph.pulsedIds]);
  const empty = graph.nodes.length === 0;

  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Dynamically configure D3 forces and auto-fit graph to look spacious and stunning
  useEffect(() => {
    if (fgRef.current && !empty) {
      fgRef.current.d3Force("charge").strength(-240);
      fgRef.current.d3Force("link").distance(100);
      
      // Auto-fit camera to contain all nodes with a smooth animation and padding
      setTimeout(() => {
        if (fgRef.current) {
          fgRef.current.zoomToFit(600, 60);
        }
      }, 100);
    }
  }, [data, empty]);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      {/* Header */}
      <div className="pointer-events-none absolute left-4 top-3.5 z-10 flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--fg-3)]">
          Knowledge Graph
        </span>
        {!empty && (
          <span className="rounded-full border border-[color:var(--line)] bg-[color:var(--bg-2)]/80 px-2 py-0.5 font-mono text-[9.5px] text-[color:var(--fg-3)] backdrop-blur-sm">
            {graph.nodes.length} nodes · {graph.edges.length} edges
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-col gap-1.5 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-2)]/70 px-3 py-2.5 backdrop-blur-md">
        {LEGEND.map((l) => (
          <div key={l.label} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: l.color, boxShadow: `0 0 7px ${l.color}66` }}
            />
            <span className="w-[68px] text-[11px] font-medium text-[color:var(--fg-2)]">
              {l.label}
            </span>
            <span className="font-mono text-[9px] text-[color:var(--fg-3)]">{l.kinds}</span>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {empty && (
        <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center px-8 text-center">
          <p className="max-w-[220px] text-[12px] leading-relaxed text-[color:var(--fg-3)]">
            As the brain reasons, the entities and sources it traverses light up
            here — a live map of what it knows.
          </p>
        </div>
      )}

      {size.w > 0 && (
        <ErrorBoundary fallback={<GraphFallback graph={graph} />}>
          <ForceGraph2D
          ref={fgRef}
          graphData={data}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          nodeRelSize={5}
          linkColor={() => "rgba(148,163,184,0.18)"}
          linkWidth={0.8}
          linkDirectionalParticles={1}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleColor={() => "rgba(56,224,200,0.7)"}
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
            // Coordinates are undefined on the first tick before the force
            // simulation positions nodes — bail to avoid non-finite canvas ops.
            if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
            const color = COLOR[node.label] ?? "#94A3B8";
            const isPulsed = pulsed.has(node.id);
            const r = isPulsed ? 6 : 4;

            // synapse pulse — soft halo on newly-traversed nodes
            if (isPulsed) {
              const grad = ctx.createRadialGradient(
                node.x,
                node.y,
                0,
                node.x,
                node.y,
                r + 9,
              );
              grad.addColorStop(0, color + "55");
              grad.addColorStop(1, color + "00");
              ctx.beginPath();
              ctx.arc(node.x, node.y, r + 9, 0, 2 * Math.PI);
              ctx.fillStyle = grad;
              ctx.fill();
            }

            // node core with subtle ring
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.lineWidth = 1 / scale;
            ctx.strokeStyle = "rgba(10,11,13,0.9)";
            ctx.stroke();

            if (scale > 1.4) {
              ctx.font = `500 ${10 / scale}px ui-sans-serif, system-ui, sans-serif`;
              ctx.fillStyle = "rgba(206,212,222,0.9)";
              ctx.fillText(node.name, node.x + r + 2.5, node.y + 3);
            }
          }}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
