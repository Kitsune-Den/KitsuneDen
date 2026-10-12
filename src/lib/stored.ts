/**
 * Tiny localStorage store for per-device preferences. Writes notify every
 * subscriber so all readers of a key stay in sync. Values also live in memory
 * so a preference still applies for the session when storage is blocked.
 *
 * No React here: theme.ts imports this and is pulled into the root layout.
 * The hook lives in useStored.ts.
 */

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export function writeStored(key: string, value: string) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode / blocked storage: preference just won't persist
  }
  listeners.forEach((l) => l());
}

export function subscribeStored(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
