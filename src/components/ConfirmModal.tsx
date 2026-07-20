"use client";

import { useEffect } from "react";

type ConfirmModalProps = {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Delete",
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="modal-overlay open" onClick={onCancel}>
      <div
        className="modal-card confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && <h3 className="modal-card__title">{title}</h3>}
        <p className="confirm-modal__msg">{message}</p>
        <div className="modal-actions confirm-modal__actions">
          <button className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? "btn--stop" : "btn--start"}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
