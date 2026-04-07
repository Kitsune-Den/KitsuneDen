"use client";

import { ReactNode } from "react";
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
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-den-card border border-den-border rounded-xl shadow-2xl w-full max-w-md mx-4 animate-[pageIn_0.15s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-den-border">
          <h2 className="text-[15px] font-bold text-den-text">{title}</h2>
          <button
            onClick={onCancel}
            className="text-den-text-muted hover:text-den-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 text-[13px] text-den-text-muted leading-relaxed">
          {children}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-den-border">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-[13px] font-medium rounded-lg text-den-text-muted bg-den-surface border border-den-border hover:bg-den-card-hover transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-[13px] font-semibold rounded-lg transition-colors disabled:opacity-50 ${
              confirmDestructive
                ? "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                : "bg-den-cyan-glow text-den-cyan border border-[rgba(79,195,247,0.4)] hover:bg-[rgba(79,195,247,0.15)]"
            }`}
          >
            {loading ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
