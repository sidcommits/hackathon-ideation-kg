"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useDictation } from "@/lib/useDictation";
import { useChat } from "@/lib/useChat";
import { ChatThread } from "@/components/ChatThread";
// GraphCanvas retained intentionally (state.graph is still populated) — the graph
// visualization was removed from the layout in favor of the docked Sources panel.
// import { GraphCanvas } from "@/components/GraphCanvas";
import { ClearanceSelector } from "@/components/ClearanceSelector";
import { AvatarStage } from "@/components/AvatarStage";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SourcesPanel, DockedSourcesPanel } from "@/components/SourcesPanel";
import { LearningsPreview } from "@/components/LearningsPreview";
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
    reflection,
    reflecting,
    ingesting,
    reflect,
    ingestLearnings,
    dismissReflection,
    learnedFlash,
    clearLearnedFlash,
  } = useChat();

  const [input, setInput] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [registering, setRegistering] = useState(false);

  // Persist tunnel URL across page loads
  useEffect(() => {
    const saved = localStorage.getItem("tunnelUrl");
    if (saved) setTunnelUrl(saved);
  }, []);

  const handleTunnelUrlChange = (url: string) => {
    setTunnelUrl(url);
    if (url.trim()) localStorage.setItem("tunnelUrl", url.trim());
    else localStorage.removeItem("tunnelUrl");
  };
  const hasMessages = state.messages.length > 0;

  // Sources panel: which answer it shows, and (when a citation is clicked) which
  // document to expand-to + highlight. focusNonce re-fires the highlight on repeat clicks.
  const [sourcesMsg, setSourcesMsg] = useState<Message | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [focusDoc, setFocusDoc] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  // A citation chip was clicked in the chat → show that answer's tree, expand to
  // the clicked document, and pulse it (docked panel on desktop, slide-over on mobile).
  const selectSource = (m: Message, docTitle: string) => {
    setSourcesMsg(m);
    setFocusDoc(docTitle);
    setFocusNonce((n) => n + 1);
    setSourcesOpen(true);
  };
  const latestAnswer = [...state.messages].reverse().find((m) => m.role === "assistant") ?? null;

  // Near-realtime mic dictation via OpenAI transcription. Each re-transcribe
  // returns the FULL transcript of the clip so far, so we replace the input with it.
  const mic = useDictation({ onText: (text) => setInput(text) });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mic.recording) void mic.stop();
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    void send(q);
  };

  return (
    <main className="brain-canvas grid h-screen grid-cols-[1fr_auto] text-[color:var(--fg)]">
      {/* ── Conversation column ─────────────────────────────── */}
      <section className="relative flex min-w-0 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-[color:var(--line)] px-6 py-4">
          <div className="flex items-center gap-3.5">
            <BrandMark />
            <div className="leading-tight">
              <div className="flex items-baseline gap-2">
                <span className="display text-[19px] tracking-[0.02em] text-[color:var(--fg)]">Clooless</span>
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
            {state.messages.some((m) => m.role === "assistant") && (
              <button
                onClick={() => void reflect()}
                disabled={reflecting}
                className="rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-2)]/70 px-2.5 py-1 text-[length:var(--text-xs)] font-medium uppercase tracking-[0.12em] text-[color:var(--fg-2)] transition-colors hover:border-[color:var(--accent-dim)] hover:text-[color:var(--accent)] disabled:opacity-40 cursor-pointer"
                title="Distill this chat and teach Clooless"
              >
                {reflecting ? "Reflecting…" : "Teach the Brain"}
              </button>
            )}
            <Link
              href="/leaderboard"
              className="flex h-8 items-center gap-1.5 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-2)]/70 px-2.5 text-[color:var(--fg-2)] hover:text-[color:var(--fg)] hover:border-[color:var(--accent-dim)] transition-all"
              title="Knowledge Champions Leaderboard"
            >
              <span className="text-sm">🏆</span>
              <span className="hidden text-[length:var(--text-xs)] font-medium sm:block">Leaderboard</span>
            </Link>
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
                <p className="text-[length:var(--text-sm)] leading-normal text-[color:var(--fg-3)] mb-4">
                  To connect the Beyond Presence digital avatar, provide your localtunnel or ngrok public URL.
                </p>
                <div className="flex flex-col gap-2.5">
                  <div>
                    <label htmlFor="tunnel-url-input" className="block text-[length:var(--text-2xs)] uppercase tracking-wider font-semibold text-[color:var(--fg-3)] mb-1">
                      Public Tunnel URL
                    </label>
                    <input
                      id="tunnel-url-input"
                      type="url"
                      placeholder="https://xxxx.locallt.ly"
                      value={tunnelUrl}
                      onChange={(e) => handleTunnelUrlChange(e.target.value)}
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
                <ChatThread state={state} onSelectSource={selectSource} />
              </div>
            </div>
          ) : hasMessages ? (
            <div className="mx-auto max-w-3xl px-6 py-6">
              <ChatThread state={state} onSelectSource={selectSource} />
            </div>
          ) : (
            <EmptyState
              onPick={(q) => void send(q)}
              busy={busy}
              startCall={startCall}
              isAgentRegistered={isAgentRegistered}
              onConfigure={() => setShowConfig(true)}
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
                  placeholder={mic.recording ? "Listening…" : "Ask Clooless…"}
                  aria-label="Ask Clooless"
                  className="min-w-0 flex-1 bg-transparent py-1 text-[15px] text-[color:var(--fg)] placeholder:text-[color:var(--fg-3)] outline-none"
                />
                {mic.supported && (
                  <MicButton listening={mic.recording} busy={mic.busy} onClick={mic.toggle} />
                )}
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="shrink-0 rounded-xl border border-[color:var(--line-2)] bg-[color:var(--bg-2)] px-3 py-1.5 text-xs font-medium text-[color:var(--fg-2)] transition-all hover:border-[color:var(--accent-dim)] hover:text-[color:var(--fg)] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Send"
                >
                  <SendArrow />
                </button>
              </div>
              <p className="mt-2 px-1 text-center text-[length:var(--text-xs)] text-[color:var(--fg-3)]">
                Answers cite their source document, passage, and sensitivity label.
              </p>
            </div>
          </form>
        )}
        {/* Left-edge toggle for the Sources slide-over — narrow screens only
            (on lg+ the docked Sources column is always visible). */}
        {hasMessages && !sourcesOpen && (
          <button
            type="button"
            onClick={() => {
              setSourcesMsg(latestAnswer);
              setSourcesOpen(true);
            }}
            className="group absolute left-0 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1.5 rounded-r-xl border border-l-0 border-[color:var(--line)] bg-[color:var(--bg-2)]/85 py-3 pl-1.5 pr-2 text-[color:var(--fg-3)] backdrop-blur-md transition-colors hover:text-[color:var(--accent)] cursor-pointer lg:hidden"
            title="Sources"
            aria-label="Open sources panel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
            <span className="font-mono text-[length:var(--text-2xs)] uppercase tracking-[0.18em] [writing-mode:vertical-rl]">
              Sources
            </span>
          </button>
        )}

        {/* Sources slide-over panel (narrow screens) */}
        <SourcesPanel
          message={sourcesMsg}
          open={sourcesOpen}
          onClose={() => setSourcesOpen(false)}
          focusDoc={focusDoc}
          focusNonce={focusNonce}
        />
      </section>

      {/* ── Sources & Relations column — always in DOM so width can animate ── */}
      <aside
        className={`relative hidden lg:block overflow-hidden transition-[width] duration-500 ease-in-out bg-[color:var(--bg)] ${
          latestAnswer
            ? "w-[440px] border-l border-[color:var(--line)]"
            : "w-0 border-transparent"
        }`}
      >
        {latestAnswer && (
          <DockedSourcesPanel message={sourcesMsg ?? latestAnswer} focusDoc={focusDoc} focusNonce={focusNonce} />
        )}
      </aside>

      {/* Recursive improvement: preview distilled truths, accept/reject before ingest */}
      {reflection && (
        <LearningsPreview
          reflection={reflection}
          ingesting={ingesting}
          onAccept={ingestLearnings}
          onReject={dismissReflection}
        />
      )}
      {learnedFlash && (
        <button
          type="button"
          onClick={clearLearnedFlash}
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[color:var(--line-2)] bg-[color:var(--bg-2)]/95 px-4 py-2 text-[length:var(--text-sm)] text-[color:var(--fg)] shadow-xl backdrop-blur cursor-pointer"
        >
          {learnedFlash}
        </button>
      )}
    </main>
  );
}

function BrandMark() {
  return (
    <img
      src="/logo_brain.png"
      alt="Company Brain logo"
      className="h-9 w-9 rounded-md object-contain"
    />
  );
}

function StatusPill({ busy }: { busy: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-[color:var(--bg-2)]/70 px-2.5 py-1">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          busy
            ? "bg-[color:var(--accent)] animate-pulse"
            : "bg-[color:var(--brass)]"
        }`}
      />
      <span className="font-mono text-[length:var(--text-xs)] uppercase tracking-[0.15em] text-[color:var(--fg-3)]">
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

/* Mic button — near-realtime dictation (OpenAI transcription via /api/transcribe). */
function MicButton({
  listening,
  busy,
  onClick,
}: {
  listening: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={listening ? "Stop dictation" : "Dictate with microphone"}
      aria-pressed={listening}
      title={listening ? "Stop dictation" : "Speak to dictate"}
      className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-xl border transition-all cursor-pointer ${
        listening
          ? "border-[color:var(--accent-dim)] bg-[color:var(--accent-glow)] text-[color:var(--accent)] animate-pulse"
          : "border-[color:var(--line-2)] bg-[color:var(--bg-2)] text-[color:var(--fg-2)] hover:border-[color:var(--accent-dim)] hover:text-[color:var(--fg)]"
      }`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
      </svg>
      {/* transcription in-flight dot */}
      {listening && busy && (
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[color:var(--accent)] shadow-[0_0_6px_var(--accent-glow)]" />
      )}
    </button>
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
  onConfigure: () => void;
}

function EmptyState({ onPick, busy, startCall, isAgentRegistered, onConfigure }: EmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center px-6 sm:px-10">
      <div className="hero-stagger w-full max-w-2xl">
        {/* Kicker */}
        <div className="kicker flex items-center justify-center gap-3">
          <span className="rule-red inline-block" aria-hidden style={{ animationDelay: "0.3s" }} />
          Clooless — Regulatory Reference
        </div>

        {/* Headline — editorial cover */}
        <h1 className="display headline-print mt-5 text-balance text-center text-[40px] leading-[1.02] text-[color:var(--fg)] sm:text-[58px]">
          Ask the institution&rsquo;s <em>memory</em>.
        </h1>

        {/* Lede */}
        <p className="mt-5 text-pretty text-center text-[length:var(--text-md)] leading-relaxed text-[color:var(--fg-2)]">
          Expert knowledge on instrument coverage and regulatory classification —
          MiFID&nbsp;II, SFDR, FATCA — synthesised from source documents and SME
          interviews, with every claim traced back to the passage it rests on.
        </p>

        {/* Numbered index of openings — a table of contents, not glass buttons */}
        <div className="mt-9 border-t border-[color:var(--line)]">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => onPick(s)}
              className="group flex w-full items-baseline gap-4 border-b border-[color:var(--line)] py-3.5 text-left transition-colors hover:bg-[color:var(--bg-2)]/40 disabled:opacity-50"
            >
              <span className="index-num w-7 shrink-0 pl-1 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex-1 text-[length:var(--text-base)] text-[color:var(--fg-2)] transition-colors group-hover:text-[color:var(--fg)]">
                {s}
              </span>
              <span className="shrink-0 translate-x-0 text-[color:var(--fg-3)] transition-all group-hover:translate-x-1 group-hover:text-[color:var(--brass)]">
                <SendArrow />
              </span>
            </button>
          ))}
        </div>

        {/* Video advisor — quiet, brass-outlined. Registration lives behind the gear. */}
        <div className="mt-7 flex justify-center">
          {isAgentRegistered ? (
            <button
              type="button"
              onClick={startCall}
              disabled={busy}
              className="group inline-flex items-center gap-2.5 rounded-lg border border-[color:var(--brass-dim)]/60 bg-[color:var(--bg-2)]/50 px-4 py-2.5 text-[length:var(--text-sm)] text-[color:var(--fg-2)] transition-all hover:border-[color:var(--brass)] hover:text-[color:var(--fg)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--brass)]" aria-hidden />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
              Consult the Video Advisor
            </button>
          ) : (
            <button
              type="button"
              onClick={onConfigure}
              className="kicker inline-flex items-center gap-2 text-[length:var(--text-2xs)] text-[color:var(--fg-3)] transition-colors hover:text-[color:var(--brass)] cursor-pointer"
            >
              <span className="h-1 w-1 rounded-full bg-[color:var(--fg-3)]" aria-hidden />
              Connect the video advisor in configuration
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
