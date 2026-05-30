"use client";
import { useMemo, useState } from "react";
import type { Message } from "@/lib/chatReducer";

/* Semantic palette — mirrors GraphCanvas / globals.css. */
const COLOR: Record<string, string> = {
  Regulation: "#34D399",
  DataAttribute: "#34D399",
  InstrumentType: "#34D399",
  Obligation: "#60A5FA",
  Concept: "#60A5FA",
  Insight: "#60A5FA",
  Document: "#C084FC",
  Chunk: "#C084FC",
};

function splitId(id: string): { label: string; name: string } {
  const i = id.indexOf(":");
  if (i === -1) return { label: "", name: id };
  return { label: id.slice(0, i), name: id.slice(i + 1) };
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function SensitivityDot({ sensitivity }: { sensitivity: string }) {
  const color =
    sensitivity === "Confidential"
      ? "var(--sev-conf)"
      : sensitivity === "C2 Internal"
        ? "var(--sev-internal)"
        : "var(--fg-3)";
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="font-mono text-[8.5px] uppercase tracking-[0.1em]" style={{ color }}>
        {sensitivity}
      </span>
    </span>
  );
}

/* ── Sources tier: Document → passages ── */
function SourcesTree({ message }: { message: Message }) {
  const groups = useMemo(() => {
    const m = new Map<string, { sensitivity: string; passages: string[] }>();
    for (const c of message.citations ?? []) {
      if (!m.has(c.doc_title)) m.set(c.doc_title, { sensitivity: c.sensitivity, passages: [] });
      m.get(c.doc_title)!.passages.push(c.chunk_text);
    }
    return [...m.entries()];
  }, [message.citations]);

  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  if (groups.length === 0) {
    return <p className="px-1 py-2 text-[11px] text-[color:var(--fg-3)]">No sources cited.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {groups.map(([title, g]) => {
        const isOpen = open.has(title);
        return (
          <div key={title} className="rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-2)]/50">
            <button
              type="button"
              onClick={() => toggle(title)}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--bg-3)]/40 cursor-pointer"
            >
              <span className="text-[color:var(--fg-3)]">
                <Chevron open={isOpen} />
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-[color:var(--node-provenance)]">
                <path d="M6 3h8l4 4v14H6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[color:var(--fg-2)]">
                {title}
              </span>
              <span className="shrink-0 rounded-full bg-[color:var(--bg-3)] px-1.5 py-0.5 font-mono text-[8.5px] text-[color:var(--fg-3)]">
                {g.passages.length}
              </span>
              <SensitivityDot sensitivity={g.sensitivity} />
            </button>
            {isOpen && (
              <div className="flex flex-col gap-1 border-t border-[color:var(--line)] px-2.5 py-2 pl-7">
                {g.passages.map((p, i) => (
                  <p
                    key={i}
                    className="border-l border-[color:var(--line-2)] pl-2 text-[11px] leading-relaxed text-[color:var(--fg-2)]"
                  >
                    {p.length > 220 ? p.slice(0, 220) + "…" : p}
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Relations tier: subject node → outgoing edges ── */
function RelationsTree({ message }: { message: Message }) {
  const groups = useMemo(() => {
    const sub = message.subgraph;
    if (!sub) return [];
    const m = new Map<string, { label: string; name: string; rels: { rel: string; to: string }[] }>();
    for (const e of sub.edges) {
      const from = splitId(e.from);
      if (!m.has(e.from)) m.set(e.from, { label: from.label, name: from.name, rels: [] });
      m.get(e.from)!.rels.push({ rel: e.rel, to: e.to });
    }
    // Most-connected subjects first.
    return [...m.entries()].sort((a, b) => b[1].rels.length - a[1].rels.length);
  }, [message.subgraph]);

  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  if (groups.length === 0) {
    return <p className="px-1 py-2 text-[11px] text-[color:var(--fg-3)]">No relations traversed.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {groups.map(([id, g]) => {
        const isOpen = open.has(id);
        const color = COLOR[g.label] ?? "#94A3B8";
        return (
          <div key={id} className="rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-2)]/50">
            <button
              type="button"
              onClick={() => toggle(id)}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--bg-3)]/40 cursor-pointer"
            >
              <span className="text-[color:var(--fg-3)]">
                <Chevron open={isOpen} />
              </span>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}66` }} />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[color:var(--fg)]">
                {g.name}
              </span>
              <span className="shrink-0 rounded-full bg-[color:var(--bg-3)] px-1.5 py-0.5 font-mono text-[8.5px] text-[color:var(--fg-3)]">
                {g.rels.length}
              </span>
            </button>
            {isOpen && (
              <div className="flex flex-col gap-1.5 border-t border-[color:var(--line)] px-2.5 py-2 pl-7">
                {g.rels.map((r, i) => {
                  const to = splitId(r.to);
                  const toColor = COLOR[to.label] ?? "#94A3B8";
                  return (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <span className="shrink-0 rounded border border-[color:var(--line)] bg-[color:var(--bg-2)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-[color:var(--fg-3)]">
                        {r.rel}
                      </span>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: toColor }} />
                      <span className="min-w-0 truncate font-medium text-[color:var(--fg-2)]">{to.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SourcesPanel({
  message,
  open,
  onClose,
}: {
  message: Message | null;
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"sources" | "relations">("sources");
  const preview = message?.text?.replace(/[#*`>]/g, "").trim().slice(0, 90);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 z-30 bg-black/30 backdrop-blur-[1px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden
      />

      {/* Sliding panel */}
      <aside
        className={`absolute inset-y-0 left-0 z-40 flex w-[380px] max-w-[88%] flex-col border-r border-[color:var(--line)] bg-[color:var(--bg)]/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <header className="flex items-center justify-between border-b border-[color:var(--line)] px-4 py-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--fg-3)]">
              Sources &amp; Relations
            </div>
            {preview && (
              <div className="mt-0.5 truncate text-[11px] text-[color:var(--fg-2)]">{preview}…</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[color:var(--line)] text-[color:var(--fg-3)] transition-colors hover:border-[color:var(--line-2)] hover:text-[color:var(--fg)] cursor-pointer"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[color:var(--line)] px-3 py-2">
          {(["sources", "relations"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-medium capitalize transition-colors cursor-pointer ${
                tab === t
                  ? "bg-[color:var(--bg-3)] text-[color:var(--fg)]"
                  : "text-[color:var(--fg-3)] hover:text-[color:var(--fg-2)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {!message ? (
            <p className="px-1 py-2 text-[11px] text-[color:var(--fg-3)]">
              Ask a question — its sources and the relations it traversed will appear here.
            </p>
          ) : tab === "sources" ? (
            <SourcesTree message={message} />
          ) : (
            <RelationsTree message={message} />
          )}
        </div>
      </aside>
    </>
  );
}
