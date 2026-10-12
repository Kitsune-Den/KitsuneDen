"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const PORT_FIELDS = ["gamePort", "rconPort", "telnetPort", "restApiPort", "queryPort"] as const;
type PortField = (typeof PORT_FIELDS)[number];

/** Detected launch settings the form has no inputs for, sent along on save. */
const HIDDEN_FIELDS = ["jar", "launchMode", "argFiles"] as const;

export interface PortAdvice {
  value: number;
  source: "config" | "default" | "entered";
  status: "free" | "adjusted" | "conflict";
  reason?: string;
  suggestion?: number;
}

interface DetectResponse {
  fields: Record<string, string | number | string[]>;
  ports: Partial<Record<PortField, PortAdvice>>;
  configFile: string | null;
  configPorts: Partial<Record<PortField, number>>;
  secretsFound: string[];
  notes: string[];
  nameFromConfig: boolean;
  dirError: string | null;
}

type Draft = Record<string, string | number>;

const isPort = (k: string): k is PortField => (PORT_FIELDS as readonly string[]).includes(k);
const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

/**
 * Autofill for the Add Server form, backed by GET /api/servers/detect.
 *
 * Fields it fills are remembered as "auto" until the user edits them, so a
 * later detection (new folder, new game) can replace its own guesses but
 * never something the user typed. Ports the user typed are sent back to be
 * checked, not replaced.
 */
export function useServerAutofill(
  open: boolean,
  type: string,
  draft: Draft,
  setDraft: (fn: (prev: Draft) => Draft) => void
) {
  const [auto, setAuto] = useState<Record<string, string>>({});
  const [result, setResult] = useState<DetectResponse | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [syncPorts, setSyncPorts] = useState(false);

  // Latest values for async callbacks
  const autoRef = useRef(auto);
  const draftRef = useRef(draft);
  const seq = useRef(0);
  useEffect(() => {
    autoRef.current = auto;
    draftRef.current = draft;
  }, [auto, draft]);

  const run = useCallback(
    async (forType: string, snapshot: Draft, mode: "fill" | "check" = "fill") => {
      const id = ++seq.current;
      const q = new URLSearchParams({ type: forType });
      const dir = String(snapshot.dir ?? "").trim();
      if (dir) q.set("dir", dir);
      for (const f of PORT_FIELDS) {
        if (!isBlank(snapshot[f]) && !autoRef.current[f]) q.set(f, String(snapshot[f]));
      }
      setDetecting(true);
      let data: DetectResponse;
      try {
        const res = await fetch(`/api/servers/detect?${q}`);
        if (!res.ok) return;
        data = (await res.json()) as DetectResponse;
      } catch {
        return;
      } finally {
        if (id === seq.current) setDetecting(false);
      }
      if (id !== seq.current) return; // a newer detection superseded this one
      setResult(data);
      if (mode === "check") return;

      const fromConfig = data.configFile ? `from ${data.configFile.split("/").pop()}` : "from the install folder";
      const labels: Record<string, string> = {};
      const updates: Draft = {};
      const current = draftRef.current;
      const mine = (k: string) => isBlank(current[k]) || !!autoRef.current[k];

      for (const [k, v] of Object.entries(data.fields)) {
        if ((HIDDEN_FIELDS as readonly string[]).includes(k) || Array.isArray(v)) continue;
        if (mine(k)) {
          updates[k] = v;
          labels[k] = k !== "name" ? "from the install folder" : data.nameFromConfig ? fromConfig : "from the folder name";
        }
      }
      for (const f of PORT_FIELDS) {
        const advice = data.ports[f];
        if (!advice || !mine(f)) continue;
        updates[f] = advice.value;
        labels[f] =
          advice.source === "config" ? fromConfig : advice.status === "adjusted" ? "moved to a free port" : "usual port, free";
      }
      setDraft((prev) => ({ ...prev, ...updates }));
      setAuto((prev) => ({ ...prev, ...labels }));
    },
    [setDraft]
  );

  /** Start over for a new game type (call from the event handler, not an effect). */
  const reset = useCallback(
    (forType: string) => {
      setAuto({});
      setResult(null);
      setSyncPorts(false);
      run(forType, {});
    },
    [run]
  );

  // Re-detect shortly after the install folder changes (typed or browsed).
  const dir = String(draft.dir ?? "");
  useEffect(() => {
    if (!open || !dir.trim()) return;
    const t = setTimeout(() => run(type, draftRef.current), 500);
    return () => clearTimeout(t);
  }, [open, type, dir, run]);

  const markEdited = useCallback((key: string) => {
    setAuto((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  /** Re-check ports after the user edits one (no fields are replaced). */
  const recheckPorts = useCallback(() => {
    if (open) run(type, draftRef.current, "check");
  }, [open, type, run]);

  const useSuggestion = useCallback(
    (field: PortField) => {
      const s = result?.ports[field]?.suggestion;
      if (!s) return;
      setDraft((prev) => ({ ...prev, [field]: s }));
      setAuto((prev) => ({ ...prev, [field]: "moved to a free port" }));
      // The game reads its own config, so offer to keep the two in step.
      if (result?.configPorts[field]) setSyncPorts(true);
      setResult((prev) =>
        prev ? { ...prev, ports: { ...prev.ports, [field]: { value: s, source: "entered", status: "free" } } } : prev
      );
    },
    [result, setDraft]
  );

  const configPortChanged =
    !!result?.configFile &&
    PORT_FIELDS.some((f) => result.configPorts[f] && !isBlank(draft[f]) && Number(draft[f]) !== result.configPorts[f]);

  return {
    detecting,
    autoLabel: (key: string) => auto[key] ?? null,
    markEdited,
    recheckPorts,
    portAdvice: (key: string) => (isPort(key) ? result?.ports[key] : undefined),
    /** Port value as it currently stands in the game's config, if different from the form. */
    configPortMismatch: (key: string) =>
      isPort(key) && result?.configPorts[key] && !isBlank(draft[key]) && Number(draft[key]) !== result.configPorts[key]
        ? result.configPorts[key]
        : null,
    useSuggestion,
    secretFoundIn: (key: string) =>
      result?.secretsFound.includes(key) ? (result.configFile?.split("/").pop() ?? "the game's config") : null,
    notes: result?.notes ?? [],
    dirError: result?.dirError ?? null,
    configFile: result?.configFile ?? null,
    configPortChanged,
    syncPorts: syncPorts && configPortChanged,
    setSyncPorts,
    reset,
    /** Detected launch settings with no form input (jar, launchMode, argFiles). */
    hiddenFields: (): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const k of HIDDEN_FIELDS) if (result?.fields[k] !== undefined) out[k] = result.fields[k];
      return out;
    },
  };
}
