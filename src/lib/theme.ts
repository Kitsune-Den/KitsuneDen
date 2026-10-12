/**
 * Theme preference: dark | light | system, plus an independent colour-blind
 * toggle. Applied as data-theme / data-cb on <html>. The same logic runs as
 * an inline script in the root layout (THEME_BOOT_SCRIPT) so the first paint
 * already has the right theme.
 */

import { readStored as read, writeStored as write } from "@/lib/stored";

export type ThemePref = "dark" | "light" | "system";

export const THEME_KEY = "kitsuneden-theme";
export const CB_KEY = "kitsuneden-colorblind";

export function parseThemePref(v: string | null): ThemePref {
  return v === "light" || v === "system" ? v : "dark";
}

export function getThemePref(): ThemePref {
  return parseThemePref(read(THEME_KEY));
}

export function getColorBlind(): boolean {
  return read(CB_KEY) === "1";
}

function resolve(pref: ThemePref): "dark" | "light" {
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(pref: ThemePref = getThemePref(), colorBlind: boolean = getColorBlind()) {
  const root = document.documentElement;
  root.dataset.theme = resolve(pref);
  if (colorBlind) root.dataset.cb = "1";
  else delete root.dataset.cb;
}

export function setThemePref(pref: ThemePref) {
  write(THEME_KEY, pref);
  applyTheme(pref);
}

export function setColorBlind(on: boolean) {
  write(CB_KEY, on ? "1" : "0");
  applyTheme(undefined, on);
}

/** Keeps "system" in sync when the OS flips between light and dark. */
export function watchSystemTheme(): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  const onChange = () => {
    if (getThemePref() === "system") applyTheme();
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"dark";var t=p==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):(p==="light"?"light":"dark");var r=document.documentElement;r.dataset.theme=t;if(localStorage.getItem("${CB_KEY}")==="1")r.dataset.cb="1";}catch(e){document.documentElement.dataset.theme="dark";}})();`;
