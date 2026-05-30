import type { ToolCard } from "@/lib/chatReducer";

/* Humanise an arg value — no raw JSON braces/quotes (that reads as console
   output). Strings render plain; objects/arrays collapse to a short hint. */
function humanArg(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(humanArg).join(", ");
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).map(humanArg).join(" · ");
  return "";
}

export function ToolCallCard({ card }: { card: ToolCard }) {
  const running = card.status === "running";
  const args = Object.entries(card.args);
  const argLine = args.map(([, v]) => humanArg(v)).filter(Boolean).join(" · ");

  return (
    <div className="tool-card rounded-lg border border-[color:var(--line)] bg-[color:var(--bg-2)]/40 overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2">
        <span
          className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${
            running
              ? "bg-[color:var(--accent)]/15 text-[color:var(--accent)]"
              : "bg-[color:var(--brass)]/15 text-[color:var(--brass)]"
          }`}
        >
          {running ? (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="origin-center animate-spin" />
            </svg>
          ) : (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>

        <span className="font-mono text-[length:var(--text-xs)] uppercase tracking-[0.14em] text-[color:var(--fg-3)]">
          {running ? "Consulting" : "Consulted"}
        </span>

        <span className="font-mono text-xs font-medium text-[color:var(--brass)]">
          {card.name}
        </span>

        {argLine && (
          <span className="min-w-0 flex-1 truncate font-mono text-[length:var(--text-sm)] text-[color:var(--fg-3)]">
            — {argLine}
          </span>
        )}
      </div>

      {card.summary && (
        <div className="border-t border-[color:var(--line)] bg-[color:var(--bg-2)]/40 px-3 py-1.5 pl-9 text-[length:var(--text-sm)] text-[color:var(--fg-2)]">
          {card.summary}
        </div>
      )}
    </div>
  );
}
