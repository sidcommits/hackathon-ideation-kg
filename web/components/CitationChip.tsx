import type { Citation } from "@/lib/chatReducer";

/* Sensitivity → CHIP styling. Sensitivity is a governance STATE and always
   renders as a labelled mono chip (never a bare line/numeral — that lane is
   brass's). Keys match corpus labels ("C2 Internal", "Confidential", …). */
const SENSITIVITY: Record<string, { chip: string; dot: string }> = {
  "C2 Internal": {
    chip: "border-[color:var(--sev-internal)]/45 text-[color:var(--sev-internal)]",
    dot: "bg-[color:var(--sev-internal)]",
  },
  Confidential: {
    chip: "border-[color:var(--sev-conf)]/45 text-[color:var(--sev-conf)]",
    dot: "bg-[color:var(--sev-conf)]",
  },
};
const DEFAULT = { chip: "border-[color:var(--line-2)] text-[color:var(--fg-3)]", dot: "bg-[color:var(--fg-3)]" };

function SensitivityChip({ sensitivity }: { sensitivity: string }) {
  const s = SENSITIVITY[sensitivity] ?? DEFAULT;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-[4px] border px-1.5 py-0.5 font-mono text-[length:var(--text-2xs)] uppercase tracking-[0.1em] ${s.chip}`}
    >
      <span className={`h-1 w-1 rounded-full ${s.dot}`} />
      {sensitivity}
    </span>
  );
}

export function CitationChip({
  c,
  index,
  onSelect,
  href,
}: {
  c: Citation;
  index?: number;
  onSelect?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      {/* brass numeral — the trace marker (a numeral, never a chip) */}
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[4px] border border-[color:var(--brass-dim)]/50 font-mono text-[length:var(--text-2xs)] font-semibold text-[color:var(--brass)] group-hover:border-[color:var(--brass)]">
        {index ?? "·"}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[length:var(--text-sm)] text-[color:var(--fg-2)] group-hover:text-[color:var(--fg)]">
        {c.doc_title}
      </span>
      <SensitivityChip sensitivity={c.sensitivity} />
    </>
  );

  const base =
    "group flex min-w-0 items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors";

  const body = onSelect ? (
    <button
      type="button"
      onClick={onSelect}
      title={`Trace “${c.doc_title}” in the Ledger`}
      aria-label={`Trace ${c.doc_title} to its source in the Ledger`}
      className={`${base} flex-1 cursor-pointer text-left hover:bg-[color:var(--bg-2)]/60`}
    >
      {inner}
    </button>
  ) : (
    <span title={c.chunk_text} className={`${base} flex-1`}>
      {inner}
    </span>
  );

  if (!href) return <div className="flex items-center gap-1">{body}</div>;

  return (
    <div className="flex items-center gap-1">
      {body}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={`Open “${c.doc_title}” in its source — new tab`}
        aria-label={`Open ${c.doc_title} in its source in a new tab`}
        className="inline-flex shrink-0 items-center rounded-md border border-[color:var(--line)] p-1 text-[color:var(--fg-3)] transition-colors hover:border-[color:var(--brass-dim)] hover:text-[color:var(--brass)] cursor-pointer"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      </a>
    </div>
  );
}
