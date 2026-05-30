"use client";
import React from "react";

interface ClearanceSelectorProps {
  value: string;
  onChange: (level: string) => void;
  disabled?: boolean;
}

export function ClearanceSelector({ value, onChange, disabled }: ClearanceSelectorProps) {
  const levels = ["Public", "C2 Internal", "Confidential"];

  const badgeColor = (lvl: string) => {
    switch (lvl) {
      case "Confidential":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      case "C2 Internal":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      default:
        return "bg-green-500/10 text-green-400 border-green-500/20";
    }
  };

  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--fg-3)]">
        Clearance:
      </span>
      <div className="relative inline-block text-left">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Security Clearance Level"
          className={`appearance-none rounded-lg border px-3 py-1 text-xs font-semibold outline-none transition-all cursor-pointer ${badgeColor(
            value
          )} ${
            disabled
              ? "opacity-50 cursor-not-allowed"
              : "hover:border-[color:var(--accent-dim)]"
          }`}
        >
          {levels.map((lvl) => (
            <option key={lvl} value={lvl} className="bg-[color:var(--bg)] text-[color:var(--fg)]">
              {lvl}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
