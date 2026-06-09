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
    <div className="min-h-screen flex items-center justify-center bg-den-bg text-den-text p-6">
      <div className="w-full max-w-md bg-den-card border border-den-border rounded-lg p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-3xl" aria-hidden>🦊</span>
          <h1 className="text-2xl font-bold">KitsuneDen</h1>
        </div>

        {setupMode ? (
          <div className="bg-den-elevated border border-den-amber rounded p-4 text-sm">
            <p className="font-semibold text-den-amber mb-2">Setup required</p>
            <p className="text-den-text-muted mb-2">
              The server has no <code className="text-den-cyan">KITSUNEDEN_PASSWORD</code> set.
              Add it to your environment (or <code>.env</code>) and restart:
            </p>
            <pre className="bg-den-base p-3 rounded text-xs overflow-x-auto text-den-text">
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
              <label htmlFor="password" className="block text-sm text-den-text-muted mb-2">
                Den password
              </label>
              <input
                id="password"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-den-base border border-den-border rounded px-3 py-2 text-den-text focus:outline-none focus:border-den-cyan"
                disabled={busy}
              />
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || password.length === 0}
              className="w-full bg-den-cyan-dim hover:bg-den-cyan text-den-bg font-semibold py-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
