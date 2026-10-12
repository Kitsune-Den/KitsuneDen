"use client";

import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  confirmDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function ConfirmModal({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  confirmDestructive = false,
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  if (!open || typeof document === "undefined") return null;

  // Portalled so a transformed ancestor (hovered cards) can't trap the fixed overlay
  return createPortal(
    <div className="overlay" data-modal-open onClick={() => !loading && onCancel()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 id="confirm-title" className="text-[16px] font-semibold text-den-text">
            {title}
          </h2>
          <button onClick={onCancel} className="icon-btn" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-4 text-[13.5px] text-den-text-muted leading-relaxed">{children}</div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-den-border">
          <button onClick={onCancel} disabled={loading} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            autoFocus
            className={`btn ${confirmDestructive ? "btn-danger !text-den-red !border-den-red/50" : "btn-primary"}`}
          >
            {loading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
