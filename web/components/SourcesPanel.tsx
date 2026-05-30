"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Message } from "@/lib/chatReducer";
import { buildSourceTree, type TreeNode } from "@/lib/sourceTree";
import { platformFor, type Platform } from "@/lib/platforms";
import provenance from "@/lib/provenance.json";

/* Official brand glyph for a source platform (root rows). */
function PlatformLogo({ platform }: { platform: Platform }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="shrink-0"
      style={{ color: platform.color }}
    >
      <path d={platform.path} />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

/* "Open in new tab" link for a tree row — root/group/document. Sibling of the
   row's expand button (not nested), so clicking it never toggles the row.
   Documents link to their hosted file; roots/groups to the platform. */
function OpenLink({ href, platform, label }: { href: string; platform: Platform; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Open ${label} in ${platform.label} — new tab`}
      aria-label={`Open ${label} in ${platform.label} in a new tab`}
      className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[color:var(--line)] px-1.5 py-1 text-[color:var(--fg-3)] transition-colors hover:border-[color:var(--accent-dim)] hover:text-[color:var(--accent)] cursor-pointer"
    >
      <ExternalLinkIcon />
      <span className="hidden font-mono text-[length:var(--text-2xs)] uppercase tracking-wider sm:inline">Open</span>
    </a>
  );
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

/* Walk the tree reproducing renderNode's key scheme to find a document by title,
   returning the keys to expand (ancestors + the doc itself) and its path-to-root. */
function locateDoc(
  roots: TreeNode[],
  docTitle: string,
): { openKeys: string[]; docKey: string; path: string[] } | null {
  let found: { openKeys: string[]; docKey: string; path: string[] } | null = null;
  const walk = (node: TreeNode, keyPrefix: string, idx: number, ancestors: string[]): boolean => {
    const key = `${keyPrefix}/${idx}-${node.label}`;
    if (node.kind === "document" && node.label === docTitle) {
      found = { openKeys: [...ancestors, key], docKey: key, path: node.meta?.path ?? [] };
      return true;
    }
    for (let i = 0; i < node.children.length; i++) {
      if (walk(node.children[i], key, i, [...ancestors, key])) return true;
    }
    return false;
  };
  for (let i = 0; i < roots.length; i++) {
    if (walk(roots[i], "root", i, [])) break;
  }
  return found;
}

/* ── Sources tier: provenance tree (root → group → document → passages) ── */
function SourcesTree({
  message,
  focusDoc,
  focusNonce,
}: {
  message: Message;
  focusDoc?: string | null;
  focusNonce?: number;
}) {
  const tree = useMemo(
    () => buildSourceTree(message.citations ?? [], provenance as Record<string, { chain: string[] }>),
    [message.citations],
  );

  // Expanded node keys, the selected document's path, and a transiently-pulsing row.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string[] | null>(null);
  const [pulseKey, setPulseKey] = useState<string | null>(null);
  // The node row currently hovered. Its "Open" button — and those of its
  // descendants — are revealed; ancestors' stay hidden. Keyed by the same
  // `${keyPrefix}/${idx}-label` scheme renderNode uses, so a descendant's key
  // is `hoveredKey + "/" + …`.
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Reset selection + expansion when switching to a different answer's tree.
  useEffect(() => {
    setOpen(new Set());
    setSelectedPath(null);
  }, [message]);

  // A citation was clicked in the chat → expand the path to that document,
  // select it, and queue it for scroll + highlight. focusNonce re-triggers when
  // the same document is clicked again.
  useEffect(() => {
    if (!focusDoc) return;
    const hit = locateDoc(tree, focusDoc);
    if (!hit) return;
    setOpen((s) => new Set([...s, ...hit.openKeys]));
    setSelectedPath(hit.path);
    setPulseKey(hit.docKey);
  }, [focusDoc, focusNonce, tree]);

  // Scroll the focused row into view once it has mounted (post-expansion), then
  // let the highlight fade.
  useEffect(() => {
    if (!pulseKey) return;
    rowRefs.current.get(pulseKey)?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(() => setPulseKey(null), 1400);
    return () => clearTimeout(t);
  }, [pulseKey]);

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

  const renderNode = (node: TreeNode, depth: number, keyPrefix: string, idx: number, rootLabel: string) => {
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

    const isRoot = node.kind === "root";
    const isDoc = node.kind === "document";
    const isSelected = isDoc && selectedPath && node.meta?.path?.join("/") === selectedPath.join("/");
    // Root rows ARE a platform; group/document rows belong to their root platform.
    const platform = platformFor(isRoot ? node.label : rootLabel);
    // Reveal this node's "Open" button when it — or any ancestor — is hovered.
    // Its key equals hoveredKey (self) or starts with `hoveredKey + "/"` (descendant);
    // an ancestor's key is shorter, so it never matches → parents stay hidden.
    const openVisible =
      hoveredKey != null && (key === hoveredKey || key.startsWith(hoveredKey + "/"));

    return (
      <div key={key}>
        {/* Row: expand/select button, then an "open in new tab" link right beside
            the name (an <a> inside a <button> would be invalid, so it's a sibling),
            then the badges pinned to the right edge. */}
        <div
          ref={(el) => {
            if (el) rowRefs.current.set(key, el);
            else rowRefs.current.delete(key);
          }}
          onMouseEnter={() => setHoveredKey(key)}
          style={{ paddingLeft: pad + 8 }}
          className={`flex items-center gap-1.5 rounded-lg pr-1.5 transition-colors hover:bg-[color:var(--bg-3)]/40 ${
            isSelected ? "trace-bound" : ""
          } ${pulseKey === key ? "source-focus-pulse" : ""}`}
        >
          <button
            type="button"
            onClick={() => {
              if (hasChildren) toggle(key);
              if (isDoc) setSelectedPath(node.meta?.path ?? null);
            }}
            className="flex min-w-0 items-center gap-2 py-1.5 text-left cursor-pointer"
          >
            <span className="w-3 shrink-0 text-[color:var(--fg-3)]">
              {hasChildren ? <Chevron open={isOpen} /> : null}
            </span>
            {isRoot ? <PlatformLogo platform={platform} /> : <NodeGlyph kind={node.kind} label={node.label} />}
            <span
              className={`min-w-0 truncate ${
                isDoc
                  ? "font-mono text-[length:var(--text-sm)] text-[color:var(--fg-2)]"
                  : `text-[length:var(--text-sm)] text-[color:var(--fg)] ${isRoot ? "font-semibold" : "font-medium"}`
              }`}
            >
              {node.label}
            </span>
          </button>

          {/* Open-in-new-tab — next to the name, hover-revealed (this node + descendants). */}
          <span
            className={`shrink-0 transition-opacity duration-100 ${
              openVisible ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <OpenLink
              href={(isDoc && node.meta?.url) ? node.meta.url : platform.url}
              platform={platform}
              label={node.label}
            />
          </span>

          {/* Badges pinned to the right edge. */}
          {isDoc && (
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              <span className="rounded-full bg-[color:var(--bg-3)] px-1.5 py-0.5 font-mono text-[length:var(--text-2xs)] text-[color:var(--fg-3)]">
                {node.meta?.passageCount}
              </span>
              {node.meta?.sensitivity && <SensitivityDot sensitivity={node.meta.sensitivity} />}
            </span>
          )}
        </div>
        {isOpen && hasChildren && (
          <div>{node.children.map((c, i) => renderNode(c, depth + 1, key, i, rootLabel))}</div>
        )}
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
      <div className="flex flex-col" onMouseLeave={() => setHoveredKey(null)}>
        {tree.map((root, i) => renderNode(root, 0, "root", i, root.label))}
      </div>
    </div>
  );
}

/* Sources content, shared by the slide-over (mobile) and the docked column (desktop). */
function SourcesBody({
  message,
  focusDoc,
  focusNonce,
}: {
  message: Message | null;
  focusDoc?: string | null;
  focusNonce?: number;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-3 py-3">
      {!message ? (
        <p className="px-1 py-2 text-[length:var(--text-sm)] text-[color:var(--fg-3)]">
          Ask a question — the source documents and passages behind its answer will appear here.
        </p>
      ) : (
        <SourcesTree message={message} focusDoc={focusDoc} focusNonce={focusNonce} />
      )}
    </div>
  );
}

/* Docked Sources column — replaces the knowledge-graph panel on large screens.
   Always visible; follows the latest answer (or a clicked citation).
   GraphCanvas code is retained, just no longer rendered here. */
export function DockedSourcesPanel({
  message,
  focusDoc,
  focusNonce,
}: {
  message: Message | null;
  focusDoc?: string | null;
  focusNonce?: number;
}) {
  const preview = message?.text?.replace(/[#*`>]/g, "").trim().slice(0, 90);
  return (
    <div className="flex h-full flex-col bg-[color:var(--bg-2)]">
      <header className="border-b border-[color:var(--line)] px-4 py-[14px]">
        <div className="flex items-center gap-2.5">
          <span className="kicker text-[color:var(--brass)]">Provenance</span>
          <span className="rule-brass-in h-px flex-1 bg-[color:var(--brass-dim)]/40" aria-hidden />
        </div>
        <div className="mt-1 truncate text-[length:var(--text-sm)] text-[color:var(--fg-3)]">
          {preview ? `${preview}…` : "Every claim, traced to the passage it rests on."}
        </div>
      </header>
      <SourcesBody message={message} focusDoc={focusDoc} focusNonce={focusNonce} />
    </div>
  );
}

/* Slide-over panel — for narrow screens, where the docked column is hidden. */
export function SourcesPanel({
  message,
  open,
  onClose,
  focusDoc,
  focusNonce,
}: {
  message: Message | null;
  open: boolean;
  onClose: () => void;
  focusDoc?: string | null;
  focusNonce?: number;
}) {
  const preview = message?.text?.replace(/[#*`>]/g, "").trim().slice(0, 90);

  return (
    <div className="lg:hidden">
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
            <span className="kicker text-[color:var(--brass)]">Provenance</span>
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

        <SourcesBody message={message} focusDoc={focusDoc} focusNonce={focusNonce} />
      </aside>
    </div>
  );
}
