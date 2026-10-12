"use client";

import { ReactNode } from "react";

export type StatTone = "cyan" | "green" | "red" | "purple" | "amber";

const TONES: Record<StatTone, { icon: string; ring: string }> = {
  cyan: { icon: "text-den-cyan bg-den-cyan/10", ring: "border-den-cyan/30" },
  green: { icon: "text-den-green bg-den-green/10", ring: "border-den-green/35" },
  red: { icon: "text-den-red bg-den-red/10", ring: "border-den-red/35" },
  purple: { icon: "text-den-purple bg-den-purple/10", ring: "border-den-purple/30" },
  amber: { icon: "text-den-amber bg-den-amber/10", ring: "border-den-amber/30" },
};

interface StatCardProps {
  icon: ReactNode;
  value: string;
  suffix?: string;
  label: string;
  tone?: StatTone;
  /** Tint the card border with the tone, for the one card that should draw the eye */
  highlight?: boolean;
}

export default function StatCard({
  icon,
  value,
  suffix,
  label,
  tone = "cyan",
  highlight = false,
}: StatCardProps) {
  const t = TONES[tone];
  return (
    <div className={`den-card p-4 flex items-center gap-4 min-w-0 ${highlight ? t.ring : ""}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${t.icon}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-den-text-muted text-[12px] font-medium">{label}</div>
        <div className="text-[20px] font-semibold tracking-tight leading-tight truncate tabular-nums">
          {value}
          {suffix && (
            <span className="text-[13px] font-medium text-den-text-dim ml-1">{suffix}</span>
          )}
        </div>
      </div>
    </div>
  );
}
