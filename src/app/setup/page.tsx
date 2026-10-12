"use client";

import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";

// The query string doesn't change while this page is mounted. Server render
// and hydration read it as empty, matching the first client render.
const subscribeNoop = () => () => {};
function useLocationSearch(): string {
  return useSyncExternalStore(subscribeNoop, () => window.location.search, () => "");
}
import { KeyRound, Terminal } from "lucide-react";

/**
 * /setup — first run. Shown until the Den has a password. Asks for the
 * one-time setup code from the server log (so nobody else on the network can
 * claim the Den first), then the shared password everyone will sign in with.
 */
export default function SetupPage() {
  // Packaged launchers can open /setup?code=XXXX-XXXX to skip the copy step.
  const codeFromUrl = new URLSearchParams(useLocationSearch()).get("code") ?? "";
  const [typedCode, setCode] = useState<string | null>(null);
  const code = typedCode ?? codeFromUrl;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeFile, setCodeFile] = useState<string | null>(null);
  const [minLength, setMinLength] = useState(8);

  useEffect(() => {
    // Also prompts the server to create and print the code if it hasn't yet.
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d: { needsSetup?: boolean; codeFile?: string; minPasswordLength?: number }) => {
        if (d.needsSetup === false) window.location.replace("/login");
        if (d.codeFile) setCodeFile(d.codeFile);
        if (d.minPasswordLength) setMinLength(d.minPasswordLength);
      })
      .catch(() => {});
  }, []);

  const mismatch = confirm.length > 0 && confirm !== password;
  const tooShort = password.length > 0 && password.length < minLength;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mismatch || tooShort) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Setup failed.");
        setBusy(false);
        return;
      }
      window.location.href = "/";
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  const input =
    "w-full bg-den-bg/70 border border-den-border rounded-lg px-3 py-2.5 text-den-text focus:outline-none focus:border-den-cyan/60 focus:ring-4 focus:ring-den-cyan/10 transition";

  return (
    <div className="min-h-screen flex items-center justify-center den-canvas text-den-text p-6">
      <div className="w-full max-w-md den-card p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-[30px] leading-none bg-gradient-to-br from-den-lantern/25 to-den-lantern/5 border border-den-lantern/30 shadow-[0_0_28px_-6px_var(--color-den-lantern)] mb-4"
            aria-hidden
          >
            🦊
          </div>
          <h1 className="text-xl font-bold tracking-tight">Welcome to the Den</h1>
          <p className="text-[13px] text-den-text-muted mt-1">Let&apos;s light the lanterns. This takes a minute.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label htmlFor="code" className="flex items-center gap-1.5 text-[13px] font-medium text-den-text-muted mb-2">
              <Terminal size={14} aria-hidden /> Setup code
            </label>
            <input
              id="code"
              autoFocus={!code}
              autoComplete="off"
              spellCheck={false}
              placeholder="XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className={`${input} font-mono tracking-[0.2em] uppercase`}
              disabled={busy}
              required
            />
            <p className="text-[12px] text-den-text-dim mt-1.5 leading-relaxed">
              Printed in the window or log that&apos;s running the Den
              {codeFile ? (
                <>
                  , and saved to <code className="font-mono text-den-text-muted break-all">{codeFile}</code>
                </>
              ) : null}
              . It proves you&apos;re the one setting it up.
            </p>
          </div>

          <div className="pt-1 border-t border-den-border" />

          <div>
            <label htmlFor="password" className="flex items-center gap-1.5 text-[13px] font-medium text-den-text-muted mb-2">
              <KeyRound size={14} aria-hidden /> Den password
            </label>
            <input
              id="password"
              type="password"
              autoFocus={!!code}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
              disabled={busy}
              required
              aria-describedby="password-help"
            />
            <p id="password-help" className={`text-[12px] mt-1.5 ${tooShort ? "text-den-amber" : "text-den-text-dim"}`}>
              Everyone you let into the Den signs in with this one. At least {minLength} characters.
            </p>
          </div>

          <div>
            <label htmlFor="confirm" className="block text-[13px] font-medium text-den-text-muted mb-2">
              Type it again
            </label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={input}
              disabled={busy}
              required
            />
            {mismatch && <p className="text-[12px] mt-1.5 text-den-amber">Those don&apos;t match yet.</p>}
          </div>

          {error && (
            <div role="alert" className="text-sm text-den-red bg-den-red/10 border border-den-red/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !code || !password || mismatch || tooShort}
            className="w-full bg-den-accent-deep hover:bg-den-accent-fill text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Lighting the lanterns…" : "Open the Den"}
          </button>
        </form>

        <p className="text-xs text-den-text-dim text-center mt-6 leading-relaxed">
          You can change the password later in Settings. Already use a <code className="font-mono">.env</code>? Set{" "}
          <code className="font-mono">KITSUNEDEN_PASSWORD</code> there instead and this page goes away.
        </p>
      </div>
    </div>
  );
}
