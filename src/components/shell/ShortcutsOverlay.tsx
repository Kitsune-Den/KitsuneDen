"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { SHORTCUTS } from "@/lib/useHotkeys";

export const OPEN_SHORTCUTS_EVENT = "den:shortcuts";

/** The "?" cheat sheet. Opened by the ? key or the sidebar's Shortcuts button. */
export default function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setOpen(false);
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SHORTCUTS_EVENT, toggle);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SHORTCUTS_EVENT, toggle);
    };
  }, []);

  if (!open) return null;

  const scopes = [...new Set(SHORTCUTS.map((s) => s.scope))];

  return (
    <div className="overlay" data-modal-open onClick={() => setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <h2 className="text-[16px] font-semibold">Keyboard shortcuts</h2>
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 pb-5">
          {scopes.map((scope) => (
            <div key={scope} className="mt-3">
              <div className="den-eyebrow mb-1.5">{scope}</div>
              {SHORTCUTS.filter((s) => s.scope === scope).map((s) => (
                <div key={s.label} className="flex items-center justify-between py-1.5 text-[13.5px]">
                  <span className="text-den-text-muted">{s.label}</span>
                  <span className="flex gap-1">
                    {s.keys.map((k) => (
                      <kbd key={k} className="kbd">
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
          <p className="mt-4 text-[12px] text-den-text-dim">Shortcuts are ignored while you&apos;re typing in a field.</p>
        </div>
      </div>
    </div>
  );
}
