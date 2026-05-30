import type { Citation } from "@/lib/chatReducer";

const BADGE: Record<string, string> = {
  "C2 Internal": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Confidential: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export function CitationChip({ c }: { c: Citation }) {
  return (
    <span
      title={c.chunk_text}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
        BADGE[c.sensitivity] ?? "bg-zinc-700/40 text-zinc-300 border-zinc-600"
      }`}
    >
      📄 {c.doc_title}
      <span className="opacity-70">· {c.sensitivity}</span>
    </span>
  );
}
