"use client";
import { useState } from "react";
import { useChat } from "@/lib/useChat";
import { ChatThread } from "@/components/ChatThread";
import { GraphCanvas } from "@/components/GraphCanvas";
import { ClearanceSelector } from "@/components/ClearanceSelector";
import { AvatarStage } from "@/components/AvatarStage";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SourcesPanel } from "@/components/SourcesPanel";
import type { Message } from "@/lib/chatReducer";

export default function Home() {
  const {
    state,
    busy,
    send,
    clearance,
    setClearance,
    activeCall,
    startCall,
    endCall,
    isSpeaking,
    registerAgent,
    isAgentRegistered,
  } = useChat();

  const [input, setInput] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [registering, setRegistering] = useState(false);
  const hasMessages = state.messages.length > 0;

  // Sources & Relations slide-in panel.
  const [sourcesMsg, setSourcesMsg] = useState<Message | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const openSources = (m: Message) => {
    setSourcesMsg(m);
    setSourcesOpen(true);
  };
  const latestAnswer = [...state.messages].reverse().find((m) => m.role === "assistant") ?? null;

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
      <section className="relative flex min-w-0 flex-col overflow-hidden">
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
          <div className="flex items-center gap-4 relative">
            <ClearanceSelector
              value={clearance}
              onChange={setClearance}
              disabled={busy || !!activeCall}
            />
            <StatusPill busy={busy} />
            <ThemeToggle />
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-2)]/70 text-[color:var(--fg-2)] hover:text-[color:var(--fg)] hover:border-[color:var(--accent-dim)] transition-all cursor-pointer"
              title="Beyond Presence Configuration"
              aria-label="Beyond Presence Configuration"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            {showConfig && (
              <div className="absolute right-0 top-11 z-50 w-80 rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-2)]/95 p-4 shadow-2xl backdrop-blur-md">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[color:var(--fg)] mb-2.5">
                  Advisor Integration Setup
                </h3>
                <p className="text-[11px] leading-normal text-[color:var(--fg-3)] mb-4">
                  To connect the Beyond Presence digital avatar, provide your localtunnel or ngrok public URL.
                </p>
                <div className="flex flex-col gap-2.5">
                  <div>
                    <label htmlFor="tunnel-url-input" className="block text-[9.5px] uppercase tracking-wider font-semibold text-[color:var(--fg-3)] mb-1">
                      Public Tunnel URL
                    </label>
                    <input
                      id="tunnel-url-input"
                      type="url"
                      placeholder="https://xxxx.locallt.ly"
                      value={tunnelUrl}
                      onChange={(e) => setTunnelUrl(e.target.value)}
                      className="w-full rounded-lg border border-[color:var(--line-2)] bg-[color:var(--bg)] px-3 py-1.5 text-xs text-[color:var(--fg)] placeholder:text-[color:var(--fg-3)] outline-none focus:border-[color:var(--accent)]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!tunnelUrl.trim()) return alert("Please enter a valid URL");
                      setRegistering(true);
                      try {
                        await registerAgent(tunnelUrl.trim());
                        setShowConfig(false);
                      } catch {}
                      setRegistering(false);
                    }}
                    disabled={registering || !tunnelUrl.trim()}
                    className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 py-2 text-xs font-semibold text-black transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {registering ? "Registering..." : "Register & Provision Agent"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="relative flex-1 overflow-y-auto">
          {activeCall ? (
            <div className="flex flex-col h-full p-6 gap-6">
              <div className="flex-1 min-h-[350px]">
                <AvatarStage
                  url={activeCall.livekitUrl}
                  token={activeCall.livekitToken}
                  onDisconnect={endCall}
                  isSpeaking={isSpeaking}
                />
              </div>
              <div className="h-[220px] overflow-y-auto border border-[color:var(--line)] rounded-2xl bg-[color:var(--bg-2)]/30 p-4">
                <ChatThread state={state} onOpenSources={openSources} />
              </div>
            </div>
          ) : hasMessages ? (
            <div className="mx-auto max-w-3xl px-6 py-6">
              <ChatThread state={state} onOpenSources={openSources} />
            </div>
          ) : (
            <EmptyState
              onPick={(q) => void send(q)}
              busy={busy}
              startCall={startCall}
              isAgentRegistered={isAgentRegistered}
              registerAgent={registerAgent}
            />
          )}
        </div>

        {!activeCall && (
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
        )}
        {/* Left-edge toggle for the Sources & Relations tree */}
        {hasMessages && !sourcesOpen && (
          <button
            type="button"
            onClick={() => {
              setSourcesMsg(latestAnswer);
              setSourcesOpen(true);
            }}
            className="group absolute left-0 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1.5 rounded-r-xl border border-l-0 border-[color:var(--line)] bg-[color:var(--bg-2)]/85 py-3 pl-1.5 pr-2 text-[color:var(--fg-3)] backdrop-blur-md transition-colors hover:text-[color:var(--accent)] cursor-pointer"
            title="Sources & Relations"
            aria-label="Open sources and relations panel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] [writing-mode:vertical-rl]">
              Sources
            </span>
          </button>
        )}

        {/* Sources & Relations slide-in panel */}
        <SourcesPanel
          message={sourcesMsg}
          open={sourcesOpen}
          onClose={() => setSourcesOpen(false)}
        />
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

interface EmptyStateProps {
  onPick: (q: string) => void;
  busy: boolean;
  startCall: () => void;
  isAgentRegistered: boolean;
  registerAgent: (publicUrl: string) => Promise<any>;
}

function EmptyState({ onPick, busy, startCall, isAgentRegistered, registerAgent }: EmptyStateProps) {
  const [tunnelInput, setTunnelInput] = useState("");
  const [loading, setLoading] = useState(false);

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

      {isAgentRegistered ? (
        <div className="mt-6 flex flex-col items-center">
          {/* Real-time Video Advisor trigger */}
          <button
            type="button"
            onClick={startCall}
            disabled={busy}
            className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/20 shadow-lg shadow-emerald-500/5 transition-all animate-pulse cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
            Talk to Video Advisor
          </button>
          <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 rounded-full px-2.5 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>Digital Human Advisor Ready</span>
          </div>
        </div>
      ) : (
        <div className="mt-6 w-full max-w-sm rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-left backdrop-blur-sm">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Advisor Connection Required
            </h3>
          </div>
          <p className="text-[11px] leading-normal text-[color:var(--fg-3)] mb-3.5">
            Beyond Presence needs a public tunnel to hit your local brain. Copy your URL from the <code>npx localtunnel --port 8000</code> terminal window:
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://example-tunnel.locallt.ly"
              value={tunnelInput}
              onChange={(e) => setTunnelInput(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-[color:var(--line-2)] bg-[color:var(--bg)] px-3 py-1.5 text-xs text-[color:var(--fg)] placeholder:text-[color:var(--fg-3)] outline-none focus:border-amber-500"
            />
            <button
              type="button"
              onClick={async () => {
                if (!tunnelInput.trim()) return alert("Please enter a valid localtunnel URL");
                setLoading(true);
                try {
                  await registerAgent(tunnelInput.trim());
                } catch {}
                setLoading(false);
              }}
              disabled={loading || !tunnelInput.trim()}
              className="rounded-lg bg-amber-500 hover:bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-black transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Connecting..." : "Register"}
            </button>
          </div>
        </div>
      )}

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
