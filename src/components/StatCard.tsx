"use client";

import { ReactNode } from "react";

export type StatTone = "accent" | "cyan" | "green" | "red" | "purple" | "amber" | "dim";

const TONE_VAR: Record<StatTone, string> = {
  accent: "var(--accent-bright)",
  cyan: "var(--accent-bright)",
  green: "var(--green)",
  red: "var(--red)",
  purple: "var(--violet)",
  amber: "var(--amber)",
  dim: "var(--text-dim)",
};

interface StatCardProps {
  icon: ReactNode;
  value: string;
  suffix?: string;
  label: string;
  tone?: StatTone;
  /** Tint the border with the tone, for the one card that should draw the eye */
  highlight?: boolean;
}

export default function StatCard({ icon, value, suffix, label, tone = "accent", highlight = false }: StatCardProps) {
  const color = TONE_VAR[tone];
  return (
    <div
      className="den-card px-4 py-4 flex items-center gap-3.5 min-w-0"
      style={highlight ? { borderColor: `color-mix(in srgb, ${color} 55%, var(--border))` } : undefined}
    >
      <div
        className="w-11 h-11 rounded-[12px] flex items-center justify-center shrink-0"
        style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
        aria-hidden
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[22px] font-bold leading-tight truncate tabular-nums">
          {value}
          {suffix && <span className="text-[13px] font-medium text-den-text-dim ml-1">{suffix}</span>}
        </div>
        <div className="den-eyebrow !text-[11px] mt-0.5">{label}</div>
      </div>
    </div>
  );
}
