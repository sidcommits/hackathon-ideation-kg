"use client";

interface ValidationItem {
  id: string;
  description: string;
  source: string;
  context: string;
}

const MOCK_VALIDATION_QUEUE: ValidationItem[] = [
  {
    id: "v1",
    description: "AI matched 2023 MiFID II guidance classifying ESG-linked structured notes as 'non-complex'. Expert overrode: classified as 'complex instrument' per 2025 regulatory update.",
    source: "Jacob's override — Regulatory Update transcript",
    context: "Outdated documentation (2023) contradicted by expert's current practice",
  },
  {
    id: "v2",
    description: "Participating FFI status affects FATCA reporting thresholds for foreign financial institutions with US accounts.",
    source: "FATCA PDF · Chunk 87",
    context: "No override — matches expert knowledge",
  },
  {
    id: "v3",
    description: "SFDR Article 8 applies to funds promoting environmental characteristics, even if not exclusively sustainable.",
    source: "EU SFDR Regulation",
    context: "No override — matches expert knowledge",
  },
];

export function ValidationCard() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--fg-3)]">
          Capture Expert Overrides
        </span>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[9.5px] text-amber-400">
          {MOCK_VALIDATION_QUEUE.length} items
        </span>
      </div>

      {MOCK_VALIDATION_QUEUE.map((item) => {
        const isOverride = item.description.startsWith("AI matched");
        return (
          <div
            key={item.id}
            className={`group rounded-xl border p-3.5 transition-all ${
              isOverride
                ? "border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40 animate-[pulse-border_3s_ease-in-out_infinite]"
                : "border-[color:var(--line)] bg-[color:var(--bg-2)]/30 hover:border-[color:var(--line-2)]"
            }`}
            style={isOverride ? { animationDelay: "0s" } : undefined}
          >
            {/* Override badge */}
            {isOverride && (
              <div className="flex items-center gap-1.5 mb-2">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400">
                  Expert Override Detected
                </span>
              </div>
            )}

            <p className={`text-[12px] leading-relaxed mb-2 ${isOverride ? "text-[color:var(--fg)]" : "text-[color:var(--fg-2)]"}`}>
              {item.description}
            </p>

            <div className="flex items-center gap-2 mb-3">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                className="text-[color:var(--node-provenance)] shrink-0"
              >
                <path
                  d="M6 3h8l4 4v14H6z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="truncate text-[10px] text-[color:var(--fg-3)]">
                {item.source}
              </span>
            </div>

            {isOverride && (
              <p className="text-[10px] text-amber-500/70 italic mb-2.5">
                {item.context}
              </p>
            )}

            <div className="flex gap-2">
              <button
                className={`flex-1 rounded-lg py-1.5 text-[10px] font-semibold transition-all cursor-pointer ${
                  isOverride
                    ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
                    : "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 opacity-60"
                }`}
                onClick={(e) => {
                  const card = (e.target as HTMLElement).closest(".group");
                  if (card) {
                    card.classList.add("scale-95", "opacity-0", "transition-all", "duration-500");
                    if (isOverride) {
                      setTimeout(() => {
                        window.dispatchEvent(new CustomEvent("insight-captured"));
                      }, 100);
                    }
                    setTimeout(() => card.remove(), 500);
                  }
                }}
              >
                {isOverride ? "✓ Capture Insight" : "Acknowledge"}
              </button>
              <button
                className="flex-1 rounded-lg border border-red-500/20 bg-red-500/10 py-1.5 text-[10px] font-semibold text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all cursor-pointer"
                onClick={(e) => {
                  const card = (e.target as HTMLElement).closest(".group");
                  if (card) {
                    card.classList.add("scale-95", "opacity-0", "transition-all", "duration-500");
                    setTimeout(() => card.remove(), 500);
                  }
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}

      <style jsx>{`
        @keyframes pulse-border {
          0%, 100% { border-color: rgba(245, 158, 11, 0.2); }
          50% { border-color: rgba(245, 158, 11, 0.5); }
        }
      `}</style>
    </div>
  );
}