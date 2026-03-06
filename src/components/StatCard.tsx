"use client";

import { ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  value: string;
  suffix?: string;
  label: string;
  iconColor?: string;
  iconBg?: string;
  borderColor?: string;
  accentBar?: boolean;
}

export default function StatCard({
  icon,
  value,
  suffix,
  label,
  iconColor = "text-den-cyan",
  iconBg = "bg-den-cyan-glow",
  borderColor,
  accentBar = false,
}: StatCardProps) {
  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-den-card to-den-surface border rounded-xl p-5 flex items-center gap-4 transition-all hover:before:opacity-100 ${
        borderColor ? `border-[${borderColor}]` : "border-den-border"
      }`}
      style={borderColor ? { borderColor } : undefined}
    >
      {/* Top accent bar */}
      <div
        className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-den-cyan to-[#29b6f6] transition-opacity ${
          accentBar ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      />

      <div
        className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}
      >
        {icon}
      </div>
      <div>
        <div className="text-[22px] font-extrabold tracking-tight leading-tight">
          {value}
          {suffix && (
            <span className="text-sm font-medium text-den-text-dim ml-1">
              {suffix}
            </span>
          )}
        </div>
        <div className="text-xs text-den-text-muted mt-0.5">{label}</div>
      </div>
    </div>
  );
}
