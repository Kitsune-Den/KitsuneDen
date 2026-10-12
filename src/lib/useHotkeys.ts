"use client";

import { useEffect, useRef } from "react";

/**
 * Single-key shortcuts. Ignored while typing in a field and when a modifier
 * is held, so Ctrl+R and friends keep their browser meaning.
 */
export function useHotkeys(bindings: Record<string, (e: KeyboardEvent) => void>, enabled = true) {
  const ref = useRef(bindings);
  ref.current = bindings;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (document.querySelector("[data-modal-open]")) return;
      const fn = ref.current[e.key];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

export const SHORTCUTS: { keys: string[]; label: string; scope: string }[] = [
  { keys: ["?"], label: "Show this list", scope: "Anywhere" },
  { keys: ["h"], label: "Go to all servers", scope: "Anywhere" },
  { keys: ["s"], label: "Start the server", scope: "Server page" },
  { keys: ["r"], label: "Restart the server", scope: "Server page" },
  { keys: ["x"], label: "Stop the server", scope: "Server page" },
  { keys: ["["], label: "Previous tab", scope: "Server page" },
  { keys: ["]"], label: "Next tab", scope: "Server page" },
];
