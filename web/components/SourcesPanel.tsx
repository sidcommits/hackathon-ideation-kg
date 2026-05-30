"use client";
import { useEffect, useMemo, useState } from "react";
import type { Message } from "@/lib/chatReducer";
import { buildSourceTree, type TreeNode } from "@/lib/sourceTree";
import provenance from "@/lib/provenance.json";

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
      <span className="font-mono text-[length:var(--text-2xs)] uppercase tracking-[0.1em]" style={{ color }}>
        {sensitivity}
      </span>
    </span>
  );
}

/* Icon glyph + colour per provenance tree node kind. */
function NodeGlyph({ kind, label }: { kind: TreeNode["kind"]; label: string }) {
  if (kind === "root") {
    const isGit = /github|git/i.test(label);
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-[color:var(--node-provenance)]">
        {isGit ? (
          <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" fill="currentColor" />
        ) : (
          <path d="M4 6h16v12H4zM4 9h16" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        )}
      </svg>
    );
  }
  if (kind === "group") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-[color:var(--node-reasoning)]">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }
  // document
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-[color:var(--node-provenance)]">
      <path d="M6 3h8l4 4v14H6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Sources tier: provenance tree (root → group → document → passages) ── */
function SourcesTree({ message }: { message: Message }) {
  const tree = useMemo(
    () => buildSourceTree(message.citations ?? [], provenance as Record<string, { chain: string[] }>),
    [message.citations],
  );

  // Expanded node labels (path-joined keys) and the selected document's path.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string[] | null>(null);

  // Reset selection + expansion when switching to a different answer's tree.
  useEffect(() => {
    setOpen(new Set());
    setSelectedPath(null);
  }, [message]);

  const toggle = (key: string) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  if (tree.length === 0) {
    return <p className="px-1 py-2 text-[length:var(--text-sm)] text-[color:var(--fg-3)]">No sources cited.</p>;
  }

  const ROW_PAD = [0, 14, 28, 42];

  const renderNode = (node: TreeNode, depth: number, keyPrefix: string, idx = 0) => {
    const key = `${keyPrefix}/${idx}-${node.label}`;
    const isOpen = open.has(key);
    const hasChildren = node.children.length > 0;
    const pad = ROW_PAD[Math.min(depth, ROW_PAD.length - 1)];

    if (node.kind === "passage") {
      return (
        <p
          key={key}
          style={{ paddingLeft: pad + 18 }}
          className="border-l border-[color:var(--line-2)] py-0.5 pr-2 text-[length:var(--text-sm)] leading-relaxed text-[color:var(--fg-2)]"
        >
          {node.label.length > 200 ? node.label.slice(0, 200) + "…" : node.label}
        </p>
      );
    }

    const isDoc = node.kind === "document";
    const isSelected = isDoc && selectedPath && node.meta?.path?.join("/") === selectedPath.join("/");

    return (
      <div key={key}>
        <button
          type="button"
          onClick={() => {
            if (hasChildren) toggle(key);
            if (isDoc) setSelectedPath(node.meta?.path ?? null);
          }}
          style={{ paddingLeft: pad + 8 }}
          className={`flex w-full items-center gap-2 py-1.5 pr-2.5 text-left transition-colors hover:bg-[color:var(--bg-3)]/40 cursor-pointer ${
            isSelected ? "bg-[color:var(--bg-3)]/60" : ""
          }`}
        >
          <span className="w-3 shrink-0 text-[color:var(--fg-3)]">
            {hasChildren ? <Chevron open={isOpen} /> : null}
          </span>
          <NodeGlyph kind={node.kind} label={node.label} />
          <span
            className={`min-w-0 flex-1 truncate ${
              isDoc ? "font-mono text-[length:var(--text-sm)] text-[color:var(--fg-2)]" : "text-[length:var(--text-sm)] font-medium text-[color:var(--fg)]"
            }`}
          >
            {node.label}
          </span>
          {isDoc && (
            <span className="shrink-0 rounded-full bg-[color:var(--bg-3)] px-1.5 py-0.5 font-mono text-[length:var(--text-2xs)] text-[color:var(--fg-3)]">
              {node.meta?.passageCount}
            </span>
          )}
          {isDoc && node.meta?.sensitivity && <SensitivityDot sensitivity={node.meta.sensitivity} />}
        </button>
        {isOpen && hasChildren && <div>{node.children.map((c, i) => renderNode(c, depth + 1, key, i))}</div>}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Breadcrumb: path-to-root of the selected document */}
      <div className="flex min-h-[24px] flex-wrap items-center gap-1 rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-2)]/50 px-2 py-1.5">
        {selectedPath ? (
          selectedPath.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-[color:var(--fg-3)]">›</span>}
              <span
                className={`font-mono text-[length:var(--text-xs)] ${
                  i === selectedPath.length - 1 ? "text-[color:var(--node-provenance)]" : "text-[color:var(--fg-2)]"
                }`}
              >
                {seg}
              </span>
            </span>
          ))
        ) : (
          <span className="font-mono text-[length:var(--text-xs)] text-[color:var(--fg-3)]">
            Click a document to trace it to its source root
          </span>
        )}
      </div>

      {/* Nested tree */}
      <div className="flex flex-col">
        {tree.map((root, i) => renderNode(root, 0, "root", i))}
      </div>
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
    return <p className="px-1 py-2 text-[length:var(--text-sm)] text-[color:var(--fg-3)]">No relations traversed.</p>;
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
              <span className="min-w-0 flex-1 truncate text-[length:var(--text-sm)] font-medium text-[color:var(--fg)]">
                {g.name}
              </span>
              <span className="shrink-0 rounded-full bg-[color:var(--bg-3)] px-1.5 py-0.5 font-mono text-[length:var(--text-2xs)] text-[color:var(--fg-3)]">
                {g.rels.length}
              </span>
            </button>
            {isOpen && (
              <div className="flex flex-col gap-1.5 border-t border-[color:var(--line)] px-2.5 py-2 pl-7">
                {g.rels.map((r, i) => {
                  const to = splitId(r.to);
                  const toColor = COLOR[to.label] ?? "#94A3B8";
                  return (
                    <div key={i} className="flex items-center gap-2 text-[length:var(--text-sm)]">
                      <span className="shrink-0 rounded border border-[color:var(--line)] bg-[color:var(--bg-2)] px-1.5 py-0.5 font-mono text-[length:var(--text-2xs)] uppercase tracking-wider text-[color:var(--fg-3)]">
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
            <div className="font-mono text-[length:var(--text-xs)] uppercase tracking-[0.18em] text-[color:var(--fg-3)]">
              Sources &amp; Relations
            </div>
            {preview && (
              <div className="mt-0.5 truncate text-[length:var(--text-sm)] text-[color:var(--fg-2)]">{preview}…</div>
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
              className={`rounded-lg px-3 py-1.5 text-[length:var(--text-sm)] font-medium capitalize transition-colors cursor-pointer ${
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
            <p className="px-1 py-2 text-[length:var(--text-sm)] text-[color:var(--fg-3)]">
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
