"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, Loader } from "lucide-react";

interface PasswordInfo {
  source: "env" | "file" | null;
  sessionSecretFromEnv: boolean;
  minPasswordLength: number;
}

/**
 * Settings › Den password. Changes the shared password set during first-run
 * setup. When KITSUNEDEN_PASSWORD is in charge it explains that instead,
 * since a value from .env can't be changed from the browser.
 */
export default function PasswordSettings() {
  const [info, setInfo] = useState<PasswordInfo | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/account/password")
      .then((r) => r.json())
      .then((d: PasswordInfo) => setInfo(d))
      .catch(() => {});
  }, []);

  const min = info?.minPasswordLength ?? 8;
  const mismatch = confirm.length > 0 && confirm !== next;
  const tooShort = next.length > 0 && next.length < min;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mismatch || tooShort) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ current, next, signOutOthers }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; signedOutOthers?: boolean };
      if (res.ok && data.success) {
        setResult({
          ok: true,
          text: data.signedOutOthers
            ? "Password changed. Everyone else will need the new one to sign back in."
            : "Password changed. Anyone already signed in stays signed in.",
        });
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        setResult({ ok: false, text: data.message ?? "Couldn't change the password." });
      }
    } catch {
      setResult({ ok: false, text: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="den-card">
      <div className="den-card-header">
        <h3 className="den-card-title">Den password</h3>
        <span className="text-[12px] text-den-text-dim">Shared by everyone who signs in</span>
      </div>

      {info === null ? (
        <div className="px-5 py-4 space-y-3">
          <div className="skel h-9" />
          <div className="skel h-9" />
        </div>
      ) : info.source === "env" ? (
        <p className="px-5 py-4 text-[13.5px] text-den-text-muted leading-relaxed">
          This Den&apos;s password comes from <code className="font-mono text-den-text">KITSUNEDEN_PASSWORD</code> in{" "}
          <code className="font-mono text-den-text">.env</code>. Change it there and restart the Den. To manage it from
          here instead, remove that line (and keep the file&apos;s session secret if you want existing sessions to survive),
          restart, and run first-run setup.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="px-5 py-4 space-y-4 max-w-[460px]">
          <label className="block">
            <span className="block text-[13px] font-medium text-den-text-muted mb-1.5">Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              className="input w-full"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={busy}
              required
            />
          </label>
          <label className="block">
            <span className="block text-[13px] font-medium text-den-text-muted mb-1.5">New password</span>
            <input
              type="password"
              autoComplete="new-password"
              className="input w-full"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={busy}
              required
            />
            <span className={`block text-[12px] mt-1 ${tooShort ? "text-den-amber" : "text-den-text-dim"}`}>
              At least {min} characters.
            </span>
          </label>
          <label className="block">
            <span className="block text-[13px] font-medium text-den-text-muted mb-1.5">New password again</span>
            <input
              type="password"
              autoComplete="new-password"
              className="input w-full"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
              required
            />
            {mismatch && <span className="block text-[12px] mt-1 text-den-amber">Those don&apos;t match yet.</span>}
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 accent-[var(--accent)]"
              checked={signOutOthers}
              onChange={(e) => setSignOutOthers(e.target.checked)}
              disabled={busy || info.sessionSecretFromEnv}
            />
            <span className="text-[13px]">
              Sign everyone else out
              <span className="block text-[12px] text-den-text-dim">
                {info.sessionSecretFromEnv
                  ? "Not available: the session secret comes from KITSUNEDEN_SESSION_SECRET in .env."
                  : "Ends every other session, so the old password stops working everywhere at once. You stay signed in."}
              </span>
            </span>
          </label>

          {result && (
            <p role="status" className={`text-[13px] flex items-center gap-1.5 ${result.ok ? "text-den-green" : "text-den-red"}`}>
              {result.ok && <Check size={14} aria-hidden />}
              {result.text}
            </p>
          )}

          <button type="submit" className="btn btn-primary" disabled={busy || !current || !next || mismatch || tooShort}>
            {busy && <Loader size={14} className="animate-spin" />}
            Change password
          </button>
        </form>
      )}
    </section>
  );
}
