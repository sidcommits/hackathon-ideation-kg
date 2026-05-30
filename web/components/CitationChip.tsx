import type { Citation } from "@/lib/chatReducer";

/* Sensitivity → pill styling. Keys match the corpus labels
   ("C2 Internal", "Confidential", "Public", …). */
const SENSITIVITY: Record<string, { dot: string; ring: string; text: string }> = {
  Public: {
    dot: "bg-emerald-400",
    ring: "border-emerald-400/35",
    text: "text-emerald-400",
  },
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

function isOutdated(year?: string): boolean {
  if (!year) return false;
  const currentYear = new Date().getFullYear();
  return parseInt(year, 10) < currentYear - 1; // 2+ years old = outdated
}

export function CitationChip({ c }: { c: Citation }) {
  const s = SENSITIVITY[c.sensitivity] ?? DEFAULT;
  const outdated = isOutdated(c.year);

  return (
    <span
      title={c.chunk_text}
      className={`group inline-flex max-w-full items-center gap-2 rounded-lg border bg-[color:var(--bg-2)]/70 py-1 pl-2 pr-2.5 transition-colors hover:border-[color:var(--line-2)] ${s.ring} ${
        outdated ? "opacity-75" : ""
      }`}
    >
      {/* provenance glyph (purple — Document) */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className={`shrink-0 ${outdated ? "text-red-400" : "text-[color:var(--node-provenance)]"}`}
      >
        <path
          d="M6 3h8l4 4v14H6z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>

      <span className={`truncate font-mono text-[11px] ${outdated ? "text-red-400 line-through" : "text-[color:var(--fg-2)] group-hover:text-[color:var(--fg)]"}`}>
        {c.doc_title}
      </span>

      {/* Year badge */}
      {c.year && (
        <>
          <span className="mx-0.5 h-3 w-px shrink-0 bg-[color:var(--line-2)]" />
          <span className={`font-mono text-[9.5px] font-medium ${
            outdated 
              ? "text-red-400 bg-red-500/10 rounded px-1 py-0.5 border border-red-500/20"
              : "text-[color:var(--fg-3)]"
          }`}>
            {c.year}
          </span>
        </>
      )}

      <span className="mx-0.5 h-3 w-px shrink-0 bg-[color:var(--line-2)]" />

      <span className={`flex shrink-0 items-center gap-1 ${s.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
        <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.1em]">
          {c.sensitivity}
        </span>
      </span>
    </span>
  );
}