import type { ToolCard } from "@/lib/chatReducer";

export function ToolCallCard({ card }: { card: ToolCard }) {
  const running = card.status === "running";
  const args = Object.entries(card.args);

  return (
    <div className="tool-card glass overflow-hidden rounded-xl">
      <div className="flex items-center gap-2.5 px-3 py-2">
        {/* status indicator */}
        <span
          className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${
            running
              ? "tool-pulse bg-[color:var(--accent)]/15 text-[color:var(--accent)]"
              : "bg-[color:var(--node-backbone)]/15 text-[color:var(--node-backbone)]"
          }`}
        >
          {running ? (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3a9 9 0 1 0 9 9"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                className="origin-center animate-spin"
              />
            </svg>
          ) : (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 13l4 4L19 7"
                stroke="currentColor"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>

        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--fg-3)]">
          {running ? "Calling" : "Tool"}
        </span>

        <span className="font-mono text-xs font-medium text-[color:var(--accent)]">
          {card.name}
        </span>

        {args.length > 0 && (
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[color:var(--fg-3)]">
            ({args.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")})
          </span>
        )}
      </div>

      {card.summary && (
        <div className="border-t border-[color:var(--line)] bg-[color:var(--bg-2)]/40 px-3 py-1.5 pl-9 font-mono text-[11px] text-[color:var(--fg-2)]">
          {card.summary}
        </div>
      )}
    </div>
  );
}
