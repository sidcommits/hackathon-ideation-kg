import type { Citation } from "@/lib/chatReducer";

/* Sensitivity → pill styling. Keys match the corpus labels
   ("C2 Internal", "Confidential", "C1 Public", …). */
const SENSITIVITY: Record<string, { dot: string; ring: string; text: string }> = {
  "C2 Internal": {
    dot: "bg-[color:var(--sev-internal)]",
    ring: "border-[color:var(--sev-internal)]/35",
    text: "text-[color:var(--sev-internal)]",
  },
  Confidential: {
    dot: "bg-[color:var(--sev-conf)]",
    ring: "border-[color:var(--sev-conf)]/35",
    text: "text-[color:var(--sev-conf)]",
  },
};

const DEFAULT = {
  dot: "bg-[color:var(--node-backbone)]",
  ring: "border-[color:var(--line-2)]",
  text: "text-[color:var(--fg-3)]",
};

export function CitationChip({ c }: { c: Citation }) {
  const s = SENSITIVITY[c.sensitivity] ?? DEFAULT;

  return (
    <span
      title={c.chunk_text}
      className={`group inline-flex max-w-full items-center gap-2 rounded-lg border bg-[color:var(--bg-2)]/70 py-1 pl-2 pr-2.5 transition-colors hover:border-[color:var(--line-2)] ${s.ring}`}
    >
      {/* provenance glyph (purple — Document) */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className="shrink-0 text-[color:var(--node-provenance)]"
      >
        <path
          d="M6 3h8l4 4v14H6z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>

      <span className="truncate font-mono text-[length:var(--text-sm)] text-[color:var(--fg-2)] group-hover:text-[color:var(--fg)]">
        {c.doc_title}
      </span>

      <span className="mx-0.5 h-3 w-px shrink-0 bg-[color:var(--line-2)]" />

      <span className={`flex shrink-0 items-center gap-1 ${s.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
        <span className="font-mono text-[length:var(--text-2xs)] font-medium uppercase tracking-[0.1em]">
          {c.sensitivity}
        </span>
      </span>
    </span>
  );
}
