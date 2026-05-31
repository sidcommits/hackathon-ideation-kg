"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

interface Contributor {
  rank: number;
  name: string;
  role: string;
  initials: string;
  avatarHue: number;
  karma: number;
  weeklyDelta: number;
}

const CONTRIBUTORS: Contributor[] = [
  { rank: 1,  name: "Miriam Schäfer",    role: "Reference Data Specialist",     initials: "MS", avatarHue: 217, karma: 4820, weeklyDelta:  2 },
  { rank: 2,  name: "Stefan Köpsell",    role: "MiFID II Compliance Lead",      initials: "SK", avatarHue: 262, karma: 4310, weeklyDelta:  0 },
  { rank: 3,  name: "Priya Nair",        role: "ESG Data Analyst",              initials: "PN", avatarHue: 158, karma: 3975, weeklyDelta:  1 },
  { rank: 4,  name: "Lukas Baumgartner", role: "FATCA Reporting Officer",       initials: "LB", avatarHue:  38, karma: 3640, weeklyDelta: -1 },
  { rank: 5,  name: "Sofia Meier",       role: "Regulatory Navigator PM",       initials: "SM", avatarHue: 328, karma: 3280, weeklyDelta:  3 },
  { rank: 6,  name: "Jan Hofer",         role: "SFDR Data Engineer",            initials: "JH", avatarHue: 190, karma: 2990, weeklyDelta: -2 },
  { rank: 7,  name: "Anita Zünd",        role: "Instrument Classification SME", initials: "AZ", avatarHue:  82, karma: 2730, weeklyDelta:  0 },
  { rank: 8,  name: "Markus Frei",       role: "Data Quality Lead",             initials: "MF", avatarHue:  24, karma: 2410, weeklyDelta:  1 },
  { rank: 9,  name: "Elena Costa",       role: "KYC & Onboarding Analyst",      initials: "EC", avatarHue:   0, karma: 2180, weeklyDelta: -1 },
  { rank: 10, name: "David Steiner",     role: "Product Coverage Engineer",     initials: "DS", avatarHue: 243, karma: 1950, weeklyDelta:  0 },
  { rank: 11, name: "Hannah Berger",     role: "Tax Navigator Specialist",      initials: "HB", avatarHue: 199, karma: 1720, weeklyDelta:  2 },
  { rank: 12, name: "Felix Roth",        role: "Regulatory Risk Analyst",       initials: "FR", avatarHue: 280, karma: 1430, weeklyDelta: -3 },
];

const MEDAL_META: Record<number, { icon: string; reward: string; color: string; bg: string; border: string; glow: string }> = {
  1: { icon: "🥇", reward: "3 extra vacation days", color: "#F59E0B", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", glow: "rgba(245,158,11,0.55)" },
  2: { icon: "🥈", reward: "2 extra vacation days", color: "#94A3B8", bg: "rgba(148,163,184,0.07)", border: "rgba(148,163,184,0.18)", glow: "rgba(148,163,184,0.45)" },
  3: { icon: "🥉", reward: "1 extra vacation day",  color: "#CD7F32", bg: "rgba(205,127,50,0.08)",  border: "rgba(205,127,50,0.2)",  glow: "rgba(205,127,50,0.55)"  },
};

// Animation phases
// idle → swap (rows animate to swapped positions) → hold (stay swapped) → revert (animate back) → idle
type Phase = "idle" | "swap" | "hold" | "revert";

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

function Avatar({ initials, hue, size = 36 }: { initials: string; hue: number; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: `hsl(${hue},60%,38%)`,
        border: `1.5px solid hsl(${hue},60%,50%,0.3)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontSize: size * 0.36,
        fontWeight: 700,
        color: `hsl(${hue},80%,92%)`,
        letterSpacing: "0.02em",
        fontFamily: "var(--font-geist-sans)",
      }}
    >
      {initials}
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--bg-3)] px-2.5 py-1 font-mono text-[11px] text-[color:var(--fg-3)]">
        —
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold"
      style={{
        background: up ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)",
        color: up ? "#34D399" : "#F87171",
        border: `1px solid ${up ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)"}`,
      }}
    >
      {up ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M5 8V2M2.5 4.5L5 2l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M5 2v6M2.5 5.5L5 8l2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {up ? "+" : ""}{delta}
    </span>
  );
}

export default function LeaderboardPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [bannerIn, setBannerIn] = useState(false);

  useEffect(() => {
    // Banner slides in first, then the rank swap plays, then reverts
    const t0 = setTimeout(() => setBannerIn(true), 300);
    const t1 = setTimeout(() => setPhase("swap"),   900);
    const t2 = setTimeout(() => setPhase("hold"),   1550);
    const t3 = setTimeout(() => setPhase("revert"), 3200);
    const t4 = setTimeout(() => setPhase("idle"),   3900);
    return () => [t0, t1, t2, t3, t4].forEach(clearTimeout);
  }, []);

  // Rows 2 and 3 are in adjacent DOM positions. translateY(±100%) swaps them
  // visually because they share the same height (identical content structure).
  const isSwapped    = phase === "swap" || phase === "hold";
  const isAnimating  = phase === "swap" || phase === "revert";
  const transition   = isAnimating ? "transform 0.55s cubic-bezier(0.4,0,0.2,1), box-shadow 0.55s ease, background 0.55s ease" : "none";

  return (
    <main className="brain-canvas min-h-screen text-[color:var(--fg)]">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[color:var(--line)] bg-[color:var(--bg)]/90 px-6 py-3.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to Clooless"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--line-2)] bg-[color:var(--bg-2)] text-[color:var(--fg-2)] transition-colors hover:border-[color:var(--accent-dim)] hover:text-[color:var(--accent)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </Link>
          <div className="leading-tight">
            <div className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-[color:var(--fg)]">
              Clooless
            </div>
            <div className="text-[length:var(--text-xs)] uppercase tracking-[0.18em] text-[color:var(--fg-3)]">
              Knowledge Champions
            </div>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* ── Hero ───────────────────────────────────────────── */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-[color:var(--line-2)] bg-[color:var(--bg-2)]" aria-hidden>
            <span className="text-3xl">🏆</span>
          </div>
          <h1 className="display text-[30px] font-semibold text-[color:var(--fg)] sm:text-[38px]">
            Clooless Champions
          </h1>
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[length:var(--text-xs)] text-[color:var(--fg-3)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            Rankings updated weekly · Rank change reflects last 7 days
          </div>
        </div>

        {/* ── Motivational banner ────────────────────────────── */}
        <div
          aria-live="polite"
          style={{
            transform: bannerIn ? "translateY(0)" : "translateY(-12px)",
            opacity: bannerIn ? 1 : 0,
            transition: "transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.5s ease",
          }}
          className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-3.5"
        >
          <span className="text-2xl shrink-0" aria-hidden>🏖️</span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-amber-400 leading-snug">
              Contribute more to Clooless — earn extra relaxing holidays!
            </p>
            <p className="mt-0.5 text-[11.5px] text-[color:var(--fg-3)] leading-snug">
              Top contributor this quarter takes home 3 bonus vacation days. Every insight you share moves you up.
            </p>
          </div>
        </div>

        {/* ── Two-column body ────────────────────────────────── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

        {/* ── Leaderboard table (left) ───────────────────────── */}
        <section aria-label="Leaderboard" className="min-w-0 flex-1 overflow-visible rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-2)]">
          {/* Table header */}
          <div className="grid grid-cols-[3.5rem_1fr_auto_auto_auto] items-center gap-4 border-b border-[color:var(--line)] px-5 py-2.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-3)]">#</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-3)]">Contributor</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-3)] text-right">Reward</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-3)] text-right">Karma</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-3)] text-right">7d</span>
          </div>

          <ul className="relative">
            {CONTRIBUTORS.map((c, idx) => {
              const medal = MEDAL_META[c.rank];

              let transform = "translateY(0)";
              let zIndex    = 1;
              let shadow    = "none";
              let rowBg     = medal ? medal.bg : undefined;

              if (c.rank === 2 && isSwapped) {
                transform = "translateY(100%)";
                zIndex    = 0;
              } else if (c.rank === 3 && isSwapped) {
                transform = "translateY(-100%)";
                zIndex    = 3;
                shadow    = "0 4px 24px rgba(52,211,153,0.18)";
                rowBg     = "rgba(52,211,153,0.07)";
              }

              return (
                <li
                  key={c.rank}
                  style={{
                    position: "relative",
                    zIndex,
                    transform,
                    transition,
                    borderTop: idx > 0 ? "1px solid var(--line)" : undefined,
                    background: rowBg,
                    boxShadow: shadow,
                    // Clip the animated rows within the card only when they'd escape
                    borderRadius: c.rank === 3 && isSwapped ? "0" : undefined,
                  }}
                  className="grid grid-cols-[3.5rem_1fr_auto_auto_auto] items-center gap-4 px-5 py-3.5 transition-colors"
                >
                  {/* Rank / medal */}
                  <div className="flex items-center gap-1.5">
                    {medal ? (
                      <span className="text-[18px] leading-none" aria-label={`Rank ${c.rank}`}>{medal.icon}</span>
                    ) : (
                      <span className="font-mono text-[13px] font-semibold text-[color:var(--fg-3)]">{c.rank}</span>
                    )}
                  </div>

                  {/* User */}
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar initials={c.initials} hue={c.avatarHue} size={36} />
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-[color:var(--fg)]">{c.name}</p>
                      <p className="truncate text-[11px] text-[color:var(--fg-3)]">{c.role}</p>
                    </div>
                  </div>

                  {/* Reward (top 3 only) */}
                  <div className="flex justify-end">
                    {medal ? (
                      <span
                        className="reward-badge-glow rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap"
                        style={{
                          background: medal.border,
                          color: medal.color,
                          ["--badge-glow" as string]: medal.glow,
                        }}
                      >
                        {medal.reward}
                      </span>
                    ) : (
                      <span />
                    )}
                  </div>

                  {/* Karma */}
                  <span
                    className="font-mono text-[14px] font-bold tabular-nums"
                    style={{ color: medal ? medal.color : "var(--node-backbone)" }}
                  >
                    {fmt(c.karma)}
                  </span>

                  {/* Weekly delta */}
                  <div className="flex justify-end">
                    <DeltaBadge delta={c.weeklyDelta} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Karma legend (right) ───────────────────────────── */}
        <aside className="lg:w-64 lg:shrink-0">
          <section className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg-2)] p-5">
            <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[color:var(--fg-2)]">
              How karma is earned
            </h3>
            <ul className="flex flex-col gap-2">
              {[
                { label: "Document ingested",           pts: "+50 pts"  },
                { label: "Expert insight captured",     pts: "+120 pts" },
                { label: "Answer cited by a colleague", pts: "+30 pts"  },
                { label: "SME session transcribed",     pts: "+200 pts" },
                { label: "Reflection approved",         pts: "+80 pts"  },
                { label: "Knowledge correction filed",  pts: "+60 pts"  },
              ].map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--bg-3)] px-3.5 py-2.5"
                >
                  <span className="text-[12px] text-[color:var(--fg-2)]">{item.label}</span>
                  <span className="font-mono text-[12px] font-bold text-[color:var(--node-backbone)] shrink-0">{item.pts}</span>
                </li>
              ))}
            </ul>
          </section>

          <p className="mt-4 text-center text-[length:var(--text-xs)] text-[color:var(--fg-3)]">
            Rewards granted quarterly · Vacation days added by HR
          </p>
        </aside>

        </div>{/* end two-column body */}
      </div>
    </main>
  );
}
