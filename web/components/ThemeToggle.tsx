"use client";
import { useEffect, useState } from "react";

type Theme = "dark" | "light";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const initial = (document.documentElement.getAttribute("data-theme") as Theme) || "dark";
    setTheme(initial);
  }, []);

  const apply = (t: Theme) => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("theme", t);
    } catch {}
  };

  const toggle = () => apply(theme === "dark" ? "light" : "dark");
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggle}
      role="switch"
      aria-checked={!isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className="group relative flex h-8 w-[58px] items-center rounded-full border border-[color:var(--line)] bg-[color:var(--bg-2)]/70 px-1 transition-colors hover:border-[color:var(--accent-dim)] cursor-pointer"
    >
      {/* sliding knob */}
      <span
        className={`absolute grid h-6 w-6 place-items-center rounded-full bg-[color:var(--bg-3)] shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isDark ? "translate-x-0" : "translate-x-[26px]"
        }`}
      >
        {isDark ? (
          // moon
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-[color:var(--accent)]" aria-hidden>
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" fill="currentColor" />
          </svg>
        ) : (
          // sun
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-[color:var(--sev-internal)]" aria-hidden>
            <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        )}
      </span>
      {/* track icons (dim, behind knob) */}
      <span className="flex w-full items-center justify-between px-1.5 text-[color:var(--fg-3)]">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden className={isDark ? "opacity-0" : "opacity-60"}>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden className={isDark ? "opacity-60" : "opacity-0"}>
          <circle cx="12" cy="12" r="5" />
        </svg>
      </span>
    </button>
  );
}
