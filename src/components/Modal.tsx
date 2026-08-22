"use client";

// Portal-based modal shell. Every dialog must render through this: page
// content is wrapped in .page-enter, whose persistent transform +
// will-change make any position:fixed descendant size itself against the
// content column instead of the viewport (modals ended up pinned between
// navbar and footer). Portaling to document.body escapes that ancestor.

import { createPortal } from "react-dom";
import type { MouseEvent, ReactNode } from "react";

interface ModalProps {
  /** Accessible name for the dialog. */
  label: string;
  /** Called on backdrop click / Escape handled by caller if needed. */
  onClose: () => void;
  /** Classes for the inner card (width, padding, max-height…). */
  cardClassName?: string;
  children: ReactNode;
}

export function Modal({ label, onClose, cardClassName = "", children }: ModalProps) {
  // Client-only by construction (all callers gate on client state), but
  // guard anyway so an SSR pass never touches `document`.
  if (typeof document === "undefined") return null;

  const onBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={onBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        className={`card ${cardClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
