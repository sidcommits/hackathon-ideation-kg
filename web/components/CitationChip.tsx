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

export function CitationChip({
  c,
  onSelect,
  href,
}: {
  c: Citation;
  onSelect?: () => void;
  href?: string;
}) {
  const s = SENSITIVITY[c.sensitivity] ?? DEFAULT;

  const inner = (
    <>
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
    </>
  );

  const base = `group inline-flex min-w-0 items-center gap-2 rounded-lg border bg-[color:var(--bg-2)]/70 py-1 pl-2 pr-2.5 transition-colors ${s.ring}`;

  // Body: focuses this document in the Sources panel (expand + highlight).
  const body = onSelect ? (
    <button
      type="button"
      onClick={onSelect}
      title={`Show “${c.doc_title}” in the Sources panel`}
      aria-label={`Show ${c.doc_title} in the Sources panel`}
      className={`${base} cursor-pointer text-left hover:border-[color:var(--accent-dim)] hover:bg-[color:var(--bg-3)]/60`}
    >
      {inner}
    </button>
  ) : (
    <span title={c.chunk_text} className={`${base} hover:border-[color:var(--line-2)]`}>
      {inner}
    </span>
  );

  // No hosted link → just the body.
  if (!href) return body;

  // Trailing "open file" link to the document's hosted location (new tab).
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      {body}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={`Open “${c.doc_title}” in its source — new tab`}
        aria-label={`Open ${c.doc_title} in its source in a new tab`}
        className="inline-flex shrink-0 items-center rounded-md border border-[color:var(--line)] p-1 text-[color:var(--fg-3)] transition-colors hover:border-[color:var(--accent-dim)] hover:text-[color:var(--accent)] cursor-pointer"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      </a>
    </span>
  );
}
