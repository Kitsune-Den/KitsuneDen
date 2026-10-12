"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutGrid,
  Activity,
  SlidersHorizontal,
  BookOpen,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Keyboard,
} from "lucide-react";
import { confirmDiscard } from "@/lib/unsaved";
import { OPEN_SHORTCUTS_EVENT } from "@/components/shell/ShortcutsOverlay";

const SECTIONS: { title: string; items: { href: string; label: string; icon: React.ReactNode; match: (p: string) => boolean }[] }[] = [
  {
    title: "Manage",
    items: [
      { href: "/", label: "Servers", icon: <LayoutGrid size={18} />, match: (p) => p === "/" || p.startsWith("/instances") },
      { href: "/activity", label: "Activity", icon: <Activity size={18} />, match: (p) => p.startsWith("/activity") },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/manage", label: "Server setup", icon: <SlidersHorizontal size={18} />, match: (p) => p.startsWith("/manage") },
      { href: "/library", label: "Library", icon: <BookOpen size={18} />, match: (p) => p.startsWith("/library") },
      { href: "/settings", label: "Settings", icon: <Settings size={18} />, match: (p) => p.startsWith("/settings") },
    ],
  },
];

const COLLAPSE_KEY = "kitsuneden-sidebar";

export function useSidebarCollapsed(): [boolean, (v: boolean) => void] {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, []);
  const set = (v: boolean) => {
    setCollapsed(v);
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
    } catch {}
  };
  return [collapsed, set];
}

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname() || "/";

  return (
    <nav
      aria-label="Main"
      className="sticky top-0 h-screen flex flex-col bg-den-base border-r border-den-border overflow-hidden"
    >
      {/* Brand */}
      <div className={`relative flex items-center gap-3 pt-5 pb-4 ${collapsed ? "flex-col px-2" : "px-4"}`}>
        <div
          aria-hidden
          className="pointer-events-none absolute left-3 top-2 w-24 h-20 rounded-full blur-2xl opacity-60"
          style={{ background: "linear-gradient(100deg, var(--accent), var(--violet))" }}
        />
        <div
          className={`relative shrink-0 rounded-2xl flex items-center justify-center bg-den-surface border border-den-border-light leading-none ${
            collapsed ? "w-10 h-10 text-[22px]" : "w-12 h-12 text-[28px]"
          }`}
        >
          🦊
        </div>
        {!collapsed && (
          <div className="relative min-w-0 flex-1">
            <div className="text-[18px] font-semibold leading-tight">
              Kitsune<span className="text-den-accent">Den</span>
            </div>
            <div className="text-[12px] text-den-text-dim">Game server panel</div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="icon-btn relative shrink-0"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        {SECTIONS.map((section) => (
          <div key={section.title} className="pt-4">
            {!collapsed && <div className="den-eyebrow px-2.5 pb-1.5">{section.title}</div>}
            {section.items.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={(e) => {
                    if (!confirmDiscard()) e.preventDefault();
                  }}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-[10px] text-[14px] font-medium mb-0.5 transition-colors ${
                    collapsed ? "justify-center h-10" : "px-[11px] py-[9px]"
                  } ${
                    active
                      ? "bg-den-accent-soft text-den-accent"
                      : "text-den-text-muted hover:bg-den-surface hover:text-den-text"
                  }`}
                >
                  <span aria-hidden>{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className={`border-t border-den-border py-3 ${collapsed ? "px-2" : "px-3"}`}>
        <div className={`flex items-center gap-2.5 ${collapsed ? "flex-col" : ""}`}>
          <div
            className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[13px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-deep))" }}
            aria-hidden
          >
            K
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[13px] font-medium truncate">Den operator</div>
              <div className="text-[11.5px] text-den-text-dim">Shared password</div>
            </div>
          )}
          <button
            onClick={async () => {
              if (!confirmDiscard()) return;
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            className="icon-btn shrink-0"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
        <div className={`mt-2.5 flex items-center text-[11.5px] text-den-text-dim ${collapsed ? "flex-col gap-2" : "justify-between px-1"}`}>
          <button
            onClick={() => window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT))}
            className="flex items-center gap-1.5 hover:text-den-text transition-colors"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard size={14} aria-hidden />
            {!collapsed && (
              <>
                Shortcuts <kbd className="kbd !h-[18px] !min-w-[18px] !text-[10.5px]">?</kbd>
              </>
            )}
          </button>
          {!collapsed && (
            <a
              href="https://github.com/Kitsune-Den/KitsuneDen"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono hover:text-den-text transition-colors"
              title="KitsuneDen on GitHub"
            >
              v{process.env.APP_VERSION || "0.0.0"}
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
