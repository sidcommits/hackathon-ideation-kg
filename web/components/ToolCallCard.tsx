import type { ToolCard } from "@/lib/chatReducer";

export function ToolCallCard({ card }: { card: ToolCard }) {
  const arg = Object.entries(card.args)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(", ");
  return (
    <div className="my-2 rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-3 py-2 font-mono text-xs">
      <div className="flex items-center gap-2">
        <span className={card.status === "running" ? "animate-pulse" : ""}>
          {card.status === "running" ? "▸" : "✓"}
        </span>
        <span className="text-sky-300">{card.name}</span>
        <span className="text-zinc-400">({arg})</span>
      </div>
      {card.summary && <div className="mt-1 pl-5 text-zinc-400">{card.summary}</div>}
    </div>
  );
}
