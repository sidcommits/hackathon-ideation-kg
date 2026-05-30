"use client";
import { useState } from "react";
import { useChat } from "@/lib/useChat";
import { ChatThread } from "@/components/ChatThread";
import { GraphCanvas } from "@/components/GraphCanvas";

export default function Home() {
  const { state, busy, send } = useChat();
  const [input, setInput] = useState("");
  const hasMessages = state.messages.length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    void send(q);
  };

  return (
    <main className="brain-canvas grid h-screen grid-cols-1 text-[color:var(--fg)] lg:grid-cols-[1fr_minmax(420px,500px)]">
      {/* ── Conversation column ─────────────────────────────── */}
      <section className="flex min-w-0 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-[color:var(--line)] px-6 py-3.5">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div className="leading-tight">
              <div className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-[color:var(--fg)]">
                SIX
                <span className="text-[color:var(--fg-3)]">·</span>
                <span className="font-medium text-[color:var(--fg-2)]">
                  Company Brain
                </span>
              </div>
              <div className="text-[10.5px] uppercase tracking-[0.18em] text-[color:var(--fg-3)]">
                Regulatory Knowledge · Traced &amp; Governed
              </div>
            </div>
          </div>
          <StatusPill busy={busy} />
        </header>

        <div className="relative flex-1 overflow-y-auto">
          {hasMessages ? (
            <div className="mx-auto max-w-3xl px-6 py-6">
              <ChatThread state={state} />
            </div>
          ) : (
            <EmptyState onPick={(q) => void send(q)} busy={busy} />
          )}
        </div>

        <form
          onSubmit={submit}
          className="border-t border-[color:var(--line)] bg-[color:var(--bg)]/60 px-6 py-4 backdrop-blur-sm"
        >
          <div className="mx-auto max-w-3xl">
            <div className="input-focus glass flex items-center gap-3 rounded-2xl px-4 py-2.5 transition-colors">
              <PromptGlyph />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask the company brain…"
                aria-label="Ask the company brain"
                className="min-w-0 flex-1 bg-transparent py-1 text-[15px] text-[color:var(--fg)] placeholder:text-[color:var(--fg-3)] outline-none"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="shrink-0 rounded-xl border border-[color:var(--line-2)] bg-[color:var(--bg-2)] px-3 py-1.5 text-xs font-medium text-[color:var(--fg-2)] transition-all hover:border-[color:var(--accent-dim)] hover:text-[color:var(--fg)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send"
              >
                <SendArrow />
              </button>
            </div>
            <p className="mt-2 px-1 text-center text-[10.5px] text-[color:var(--fg-3)]">
              Answers cite their source document, passage, and sensitivity label.
            </p>
          </div>
        </form>
      </section>

      {/* ── Knowledge-graph column ──────────────────────────── */}
      <aside className="relative hidden border-l border-[color:var(--line)] bg-[color:var(--bg)] lg:block">
        <GraphCanvas graph={state.graph} />
      </aside>
    </main>
  );
}

/* ── Brand mark: a small synapse/constellation glyph ─────── */
function BrandMark() {
  return (
    <div className="relative grid h-9 w-9 place-items-center rounded-xl border border-[color:var(--line-2)] bg-[color:var(--bg-2)] shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset]">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="5" r="2" fill="var(--node-reasoning)" />
        <circle cx="5" cy="16" r="2" fill="var(--node-backbone)" />
        <circle cx="19" cy="16" r="2" fill="var(--node-provenance)" />
        <circle cx="12" cy="13" r="1.5" fill="var(--accent)" />
        <path
          d="M12 5 12 13 M12 13 5 16 M12 13 19 16"
          stroke="rgba(155,163,174,0.4)"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}

function StatusPill({ busy }: { busy: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-[color:var(--bg-2)]/70 px-2.5 py-1">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          busy
            ? "bg-[color:var(--accent)] shadow-[0_0_8px_var(--accent-glow)] animate-pulse"
            : "bg-[color:var(--node-backbone)]"
        }`}
      />
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--fg-3)]">
        {busy ? "Reasoning" : "Ready"}
      </span>
    </div>
  );
}

function PromptGlyph() {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[color:var(--bg-2)] text-[color:var(--accent)]">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 7h16M4 12h10M4 17h13"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function SendArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12h13M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Welcoming hero / empty state ────────────────────────── */
const SUGGESTIONS = [
  "Is an ESG-linked structured note complex under MiFID II?",
  "Which SFDR attributes apply to a green bond fund?",
  "Is this instrument in scope for FATCA reporting?",
];

function EmptyState({
  onPick,
  busy,
}: {
  onPick: (q: string) => void;
  busy: boolean;
}) {
  return (
    <div className="hero-rise flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-6 grid h-16 w-16 place-items-center rounded-2xl border border-[color:var(--line-2)] bg-[color:var(--bg-2)]">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_50%_30%,var(--accent-glow),transparent_70%)]" />
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="5" r="2.2" fill="var(--node-reasoning)" />
          <circle cx="5" cy="16" r="2.2" fill="var(--node-backbone)" />
          <circle cx="19" cy="16" r="2.2" fill="var(--node-provenance)" />
          <circle cx="12" cy="13" r="1.6" fill="var(--accent)" />
          <path
            d="M12 5 12 13 M12 13 5 16 M12 13 19 16"
            stroke="rgba(155,163,174,0.45)"
            strokeWidth="1.1"
          />
        </svg>
      </div>

      <h1 className="max-w-xl text-balance text-2xl font-semibold tracking-tight text-[color:var(--fg)] sm:text-[28px]">
        Ask the institution&rsquo;s memory.
      </h1>
      <p className="mt-3 max-w-md text-pretty text-sm leading-relaxed text-[color:var(--fg-2)]">
        Expert knowledge on instrument coverage and regulatory classification —
        MiFID&nbsp;II, SFDR, FATCA — synthesised from source documents and SME
        interviews, with every answer traced back to its citation.
      </p>

      <div className="mt-8 grid w-full max-w-md gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => onPick(s)}
            className="group glass flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-[13px] text-[color:var(--fg-2)] transition-all hover:border-[color:var(--line-2)] hover:text-[color:var(--fg)] disabled:opacity-50"
          >
            <span>{s}</span>
            <span className="shrink-0 text-[color:var(--fg-3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[color:var(--accent)]">
              <SendArrow />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
