"use client";
import React, { useEffect, useMemo, useRef, useState, Component, ErrorInfo, ReactNode } from "react";
import dynamic from "next/dynamic";
import type { GraphState } from "@/lib/chatReducer";

const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), { ssr: false });

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

  // ── FOCUS HIGHLIGHT (remove this block + accessors/handlers below to reverse) ──
  // Click a node → it, its edges, and its direct (1-hop) neighbours light up;
  // everything else stays greyed out. Click background → reset to all-grey.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // node id → set of neighbour node ids (1 hop)
  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (!m.has(e.from)) m.set(e.from, new Set());
      if (!m.has(e.to)) m.set(e.to, new Set());
      m.get(e.from)!.add(e.to);
      m.get(e.to)!.add(e.from);
    }
    return m;
  }, [graph.edges]);

  const isLitNode = (id: string) =>
    selectedId === id || (selectedId !== null && (adjacency.get(selectedId)?.has(id) ?? false));

  // An edge is lit only if it touches the selected node.
  const isLitLink = (l: any) => {
    if (!selectedId) return false;
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    return s === selectedId || t === selectedId;
  };

  // Force a repaint when selection changes (accessor outputs are cached).
  useEffect(() => {
    fgRef.current?.refresh?.();
  }, [selectedId]);
  // ── END FOCUS HIGHLIGHT ──

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

  // ── ZOOM CONTROLS (remove this block + the buttons JSX below to reverse) ──
  // Dolly the camera along its current view direction. factor < 1 = zoom in.
  const zoomBy = (factor: number) => {
    const fg = fgRef.current;
    if (!fg) return;
    const cam = fg.camera();
    const dist = Math.hypot(cam.position.x, cam.position.y, cam.position.z) || 1;
    const next = Math.max(40, Math.min(2000, dist * factor));
    const k = next / dist;
    fg.cameraPosition(
      { x: cam.position.x * k, y: cam.position.y * k, z: cam.position.z * k },
      undefined,
      250,
    );
  };
  const resetView = () => fgRef.current?.zoomToFit(500, 60);
  // ── END ZOOM CONTROLS ──

  // Tune the 3D force layout and auto-frame the camera around the cluster.
  useEffect(() => {
    if (fgRef.current && !empty) {
      fgRef.current.d3Force("charge")?.strength(-60);
      fgRef.current.d3Force("link")?.distance(34);

      // Auto-fit camera to contain all nodes with a smooth animation and padding.
      setTimeout(() => {
        if (fgRef.current) {
          fgRef.current.zoomToFit(800, 60);
        }
      }, 400);
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

      {/* ── ZOOM CONTROLS (delete this block to reverse) ── */}
      {!empty && (
        <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1.5">
          {[
            { label: "Zoom in", sym: "+", onClick: () => zoomBy(0.6) },
            { label: "Zoom out", sym: "−", onClick: () => zoomBy(1.6) },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={b.onClick}
              aria-label={b.label}
              title={b.label}
              className="grid h-9 w-9 place-items-center rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-2)]/80 text-[18px] font-medium leading-none text-[color:var(--fg-2)] backdrop-blur-md transition-colors hover:border-[color:var(--accent-dim)] hover:text-[color:var(--fg)] cursor-pointer"
            >
              {b.sym}
            </button>
          ))}
          <button
            type="button"
            onClick={resetView}
            aria-label="Fit to view"
            title="Fit to view"
            className="grid h-9 w-9 place-items-center rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-2)]/80 text-[color:var(--fg-2)] backdrop-blur-md transition-colors hover:border-[color:var(--accent-dim)] hover:text-[color:var(--fg)] cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
            </svg>
          </button>
        </div>
      )}
      {/* ── END ZOOM CONTROLS ── */}

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
          <ForceGraph3D
            ref={fgRef}
            graphData={data}
            width={size.w}
            height={size.h}
            backgroundColor="rgba(0,0,0,0)"
            showNavInfo={false}
            nodeRelSize={4}
            // FOCUS HIGHLIGHT: grey unless lit (selected node or a 1-hop neighbour).
            nodeColor={(node: any) =>
              isLitNode(node.id) ? (COLOR[node.label] ?? "#94A3B8") : "#3A4150"
            }
            nodeOpacity={0.95}
            nodeResolution={16}
            nodeVal={(node: any) =>
              pulsed.has(node.id) || node.id === selectedId ? 8 : 2
            }
            onNodeClick={(node: any) =>
              setSelectedId((cur) => (cur === node.id ? null : node.id))
            }
            onBackgroundClick={() => setSelectedId(null)}
            nodeLabel={(node: any) => {
              const color = COLOR[node.label] ?? "#94A3B8";
              return `<div style="
                font:600 11px ui-sans-serif,system-ui,sans-serif;
                color:#fff;background:rgba(10,11,13,0.92);
                border:1px solid ${color}aa;border-radius:4px;
                padding:3px 7px;white-space:nowrap;">${node.name}</div>`;
            }}
            // FOCUS HIGHLIGHT: lit edges glow accent; the rest are faint grey.
            linkColor={(l: any) =>
              isLitLink(l) ? "rgba(56,224,200,0.85)" : "rgba(148,163,184,0.10)"
            }
            linkWidth={(l: any) => (isLitLink(l) ? 1.6 : 0.6)}
            linkOpacity={0.5}
            linkDirectionalParticles={(l: any) => (isLitLink(l) ? 3 : 0)}
            linkDirectionalParticleSpeed={0.012}
            linkDirectionalParticleWidth={1.8}
            linkDirectionalParticleColor={() => "rgba(56,224,200,0.85)"}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
