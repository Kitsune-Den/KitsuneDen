"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import Page from "@/components/shell/Page";
import { getColorBlind, getThemePref, setColorBlind, setThemePref, type ThemePref } from "@/lib/theme";
import { SHORTCUTS } from "@/lib/useHotkeys";

const THEMES: { id: ThemePref; label: string; icon: React.ReactNode }[] = [
  { id: "dark", label: "Dark", icon: <Moon size={14} /> },
  { id: "light", label: "Light", icon: <Sun size={14} /> },
  { id: "system", label: "System", icon: <Monitor size={14} /> },
];

const SWATCHES = ["--green", "--amber", "--red", "--accent"];

export default function SettingsPage() {
  const [theme, setTheme] = useState<ThemePref>("dark");
  const [cb, setCb] = useState(false);

  useEffect(() => {
    setTheme(getThemePref());
    setCb(getColorBlind());
  }, []);

  return (
    <Page title="Settings" subtitle="How the Den looks on this device">
      <div className="max-w-[760px] space-y-4">
        <section className="den-card">
          <div className="den-card-header">
            <h3 className="den-card-title">Appearance</h3>
          </div>
          <div className="px-5 py-4 space-y-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[14px] font-medium">Theme</div>
                <div className="text-[12.5px] text-den-text-dim">System follows your OS and switches with it.</div>
              </div>
              <div className="seg" role="group" aria-label="Theme">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    aria-pressed={theme === t.id}
                    onClick={() => {
                      setTheme(t.id);
                      setThemePref(t.id);
                    }}
                    className="inline-flex items-center gap-1.5"
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center justify-between gap-4 cursor-pointer flex-wrap">
              <div>
                <div className="text-[14px] font-medium">Colour-blind friendly status colours</div>
                <div className="text-[12.5px] text-den-text-dim">
                  Swaps green, amber and red for a palette that stays distinct with colour-vision deficiency.
                </div>
              </div>
              <span className="flex items-center gap-3">
                <span className="flex gap-1" aria-hidden>
                  {SWATCHES.map((v) => (
                    <span key={v} className="w-3.5 h-3.5 rounded-full border border-black/20" style={{ background: `var(${v})` }} />
                  ))}
                </span>
                <input
                  type="checkbox"
                  checked={cb}
                  onChange={(e) => {
                    setCb(e.target.checked);
                    setColorBlind(e.target.checked);
                  }}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
              </span>
            </label>
            <p className="text-[12px] text-den-text-dim">Saved in this browser only.</p>
          </div>
        </section>

        <section className="den-card">
          <div className="den-card-header">
            <h3 className="den-card-title">Keyboard shortcuts</h3>
            <span className="text-[12px] text-den-text-dim">
              Press <kbd className="kbd">?</kbd> anywhere
            </span>
          </div>
          <div className="px-5 py-2">
            {SHORTCUTS.map((s) => (
              <div key={s.label} className="den-row text-[13.5px]">
                <span className="text-den-text-muted">
                  {s.label} <span className="text-den-text-dim">· {s.scope}</span>
                </span>
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
        </section>
      </div>
    </Page>
  );
}
