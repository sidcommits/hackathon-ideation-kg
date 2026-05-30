import { useEffect, useState } from "react";
import { filterSelected, type Reflection, type Truth } from "@/lib/learnings";

export function LearningsPreview({
  reflection,
  ingesting,
  onAccept,
  onReject,
}: {
  reflection: Reflection;
  ingesting: boolean;
  onAccept: (selected: Truth[]) => void;
  onReject: () => void;
}) {
  const { truths } = reflection;
  const [checked, setChecked] = useState<Set<number>>(new Set());

  // Default every truth to checked whenever a new reflection arrives.
  useEffect(() => {
    setChecked(new Set(truths.map((_, i) => i)));
  }, [reflection]);

  const toggle = (i: number) =>
    setChecked((s) => {
      const n = new Set(s);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });

  const selectedCount = checked.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onReject} aria-hidden />
      <div className="glass relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl">
        <header className="border-b border-[color:var(--line)] px-5 py-3.5">
          <div className="flex items-center gap-2 text-[length:var(--text-xs)] font-medium uppercase tracking-[0.16em] text-[color:var(--fg-3)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)] shadow-[0_0_6px_var(--accent-glow)]" />
            Teach the Brain
          </div>
          <p className="mt-1 text-[length:var(--text-sm)] text-[color:var(--fg-2)]">
            {reflection.summary || "Review what I learned from this conversation."}
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {truths.length === 0 ? (
            <p className="py-6 text-center text-[length:var(--text-sm)] text-[color:var(--fg-3)]">
              Nothing new worth saving from this chat.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {truths.map((t, i) => (
                <li key={i} className="rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-3)]/40 p-3">
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={checked.has(i)}
                      onChange={() => toggle(i)}
                      className="mt-1 accent-[color:var(--accent)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-[length:var(--text-sm)] font-medium text-[color:var(--fg)]">
                        {t.question}
                      </span>
                      <span className="mt-0.5 block text-[length:var(--text-sm)] text-[color:var(--fg-2)]">
                        {t.answer}
                      </span>
                      {t.entities.length > 0 && (
                        <span className="mt-1.5 flex flex-wrap gap-1">
                          {t.entities.map((e, j) => (
                            <span key={j} className="rounded-full border border-[color:var(--line-2)] px-1.5 py-0.5 font-mono text-[length:var(--text-2xs)] text-[color:var(--fg-3)]">
                              {e}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[color:var(--line)] px-5 py-3">
          <button
            type="button"
            onClick={onReject}
            disabled={ingesting}
            className="rounded-xl border border-[color:var(--line-2)] px-3 py-1.5 text-[length:var(--text-sm)] text-[color:var(--fg-2)] transition-colors hover:text-[color:var(--fg)] disabled:opacity-40 cursor-pointer"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => onAccept(filterSelected(truths, checked))}
            disabled={ingesting || selectedCount === 0}
            className="rounded-xl bg-[color:var(--accent)] px-3.5 py-1.5 text-[length:var(--text-sm)] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer"
          >
            {ingesting ? "Saving…" : `Accept ${selectedCount}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
