"use client";

import { FormEvent, useEffect, useState } from "react";

/**
 * /login — the gate. Shared password, posted to /api/auth/login.
 *
 * On success: bounce to ?next= or "/". On wrong-password: inline error.
 * On unconfigured server (KITSUNEDEN_PASSWORD not set): explanatory message
 * pointing the operator at the README. The ?setup=1 marker is set by the
 * middleware when it hits an unconfigured server.
 */
export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [nextPath, setNextPath] = useState("/");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSetupMode(params.get("setup") === "1");
    const next = params.get("next");
    if (next && next.startsWith("/")) setNextPath(next);
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Login failed.");
        setBusy(false);
        return;
      }
      // Full reload so middleware re-evaluates and any SSR pages see the cookie.
      window.location.href = nextPath;
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center den-canvas text-den-text p-6">
      <div className="w-full max-w-sm den-card p-8">
        <div className="flex flex-col items-center text-center mb-7">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-[30px] leading-none bg-gradient-to-br from-den-lantern/25 to-den-lantern/5 border border-den-lantern/30 shadow-[0_0_28px_-6px_var(--color-den-lantern)] mb-4"
            aria-hidden
          >
            🦊
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            Kitsune<span className="text-den-lantern">Den</span>
          </h1>
          <p className="text-[13px] text-den-text-dim mt-1">The lanterns are lit. Come on in.</p>
        </div>

        {setupMode ? (
          <div className="bg-den-amber/5 border border-den-amber/40 rounded-lg p-4 text-sm">
            <p className="font-semibold text-den-amber mb-2">Setup required</p>
            <p className="text-den-text-muted mb-2">
              The server has no <code className="text-den-cyan">KITSUNEDEN_PASSWORD</code> set.
              Add it to your environment (or <code>.env</code>) and restart:
            </p>
            <pre className="bg-den-bg p-3 rounded-lg text-xs overflow-x-auto text-den-text font-mono">
              KITSUNEDEN_PASSWORD=&quot;some-shared-password&quot;{"\n"}
              KITSUNEDEN_SESSION_SECRET=&quot;32+ random chars&quot;
            </pre>
            <p className="text-den-text-dim text-xs mt-3">
              See README → Getting started → Auth for the full setup.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-[13px] font-medium text-den-text-muted mb-2">
                Den password
              </label>
              <input
                id="password"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-den-bg/70 border border-den-border rounded-lg px-3 py-2.5 text-den-text focus:outline-none focus:border-den-cyan/60 focus:ring-4 focus:ring-den-cyan/10 transition"
                disabled={busy}
              />
            </div>

            {error && (
              <div className="text-sm text-den-red bg-den-red/10 border border-den-red/30 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || password.length === 0}
              className="w-full bg-den-cyan hover:brightness-110 text-den-bg font-semibold py-2.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Signing in…" : "Enter the Den"}
            </button>
          </form>
        )}

        <p className="text-xs text-den-text-dim text-center mt-6">
          Shared password for the people who run servers here.
        </p>
      </div>
    </div>
  );
}
