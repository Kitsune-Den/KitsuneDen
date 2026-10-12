"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { X, TriangleAlert, CircleCheck } from "lucide-react";

type ToastLevel = "error" | "success";
interface Toast {
  id: number;
  level: ToastLevel;
  message: string;
}

const ToastContext = createContext<(message: string, level?: ToastLevel) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const LIFETIME_MS: Record<ToastLevel, number> = { error: 12000, success: 4000 };

/**
 * Bottom-right toasts. Failed actions surface here automatically: the
 * provider watches every non-GET /api/ call and raises an error toast when
 * one fails, so individual pages don't each need their own error banner.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (message: string, level: ToastLevel = "error") => {
      const id = nextId.current++;
      setToasts((t) => {
        // Same message already showing: don't stack duplicates
        if (t.some((x) => x.message === message && x.level === level)) return t;
        return [...t.slice(-3), { id, level, message }];
      });
      setTimeout(() => dismiss(id), LIFETIME_MS[level]);
    },
    [dismiss]
  );

  useEffect(() => {
    const original = window.fetch;
    const patched: typeof fetch = async (input, init) => {
      const res = await original(input, init);
      try {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
        const isApi = url.startsWith("/api/") && !url.startsWith("/api/auth/") && !url.startsWith("/api/console");
        if (isApi && method !== "GET") {
          const type = res.headers.get("content-type") || "";
          if (!res.ok || type.includes("application/json")) {
            const data = type.includes("application/json") ? await res.clone().json().catch(() => null) : null;
            const failed = !res.ok || data?.success === false;
            if (failed) {
              const msg = data?.message || data?.error || `Request failed (${res.status})`;
              push(String(msg), "error");
            }
          }
        }
      } catch {
        // never let the toast hook break the caller
      }
      return res;
    };
    window.fetch = patched;
    return () => {
      if (window.fetch === patched) window.fetch = original;
    };
  }, [push]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-[120] flex flex-col gap-2 w-[min(420px,calc(100vw-40px))]" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.level === "error" ? "alert" : "status"}
            className="flex items-start gap-3 pl-3.5 pr-2 py-3 rounded-[12px] bg-den-surface border shadow-[0_6px_24px_rgb(0_0_0/0.35)] animate-[toastIn_0.18s_ease-out]"
            style={{
              borderColor: t.level === "error" ? "color-mix(in srgb, var(--red) 55%, transparent)" : "var(--border-bright)",
              boxShadow: `inset 3px 0 0 ${t.level === "error" ? "var(--red)" : "var(--green)"}, 0 6px 24px rgb(0 0 0 / 0.35)`,
            }}
          >
            {t.level === "error" ? (
              <TriangleAlert size={16} className="text-den-red mt-0.5 shrink-0" aria-hidden />
            ) : (
              <CircleCheck size={16} className="text-den-green mt-0.5 shrink-0" aria-hidden />
            )}
            <div className="flex-1 text-[13px] leading-snug text-den-text break-words">{t.message}</div>
            <button onClick={() => dismiss(t.id)} className="icon-btn !w-6 !h-6" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
