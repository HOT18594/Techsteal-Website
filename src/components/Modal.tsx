"use client";

// Portal-based modal shell. Every dialog must render through this: page
// content is wrapped in .page-enter, whose persistent transform +
// will-change make any position:fixed descendant size itself against the
// content column instead of the viewport (modals ended up pinned between
// navbar and footer). Portaling to document.body escapes that ancestor.
//
// Also owns dialog focus: moves focus in on open, traps Tab inside the
// card, closes on Escape, and restores focus to the trigger on close —
// aria-modal promises all of that, and screen-reader users were previously
// tabbing straight through the backdrop into the page behind.

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { isTopOverlay, popOverlay, pushOverlay } from "@/lib/overlay-stack";

interface ModalProps {
  /** Accessible name for the dialog. */
  label: string;
  /** Called on backdrop click / Escape handled by caller if needed. */
  onClose: () => void;
  /** Classes for the inner card (width, padding, max-height…). */
  cardClassName?: string;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ label, onClose, cardClassName = "", children }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  // Latest-ref so a parent re-render (new inline onClose identity) doesn't
  // re-run the effect and yank focus away from mid-typing users.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Close on backdrop click only when the press STARTED on the backdrop:
  // a text selection that begins inside the card and ends on it also fires
  // the click event here, and closing mid-selection discarded the drag.
  const backdropPressed = useRef(false);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const trigger = document.activeElement as HTMLElement | null;
    card.focus();
    // Stacked overlays (announcement over composer, confirm inside modal…)
    // must close top-first: only the newest instance may react to Escape.
    const overlayId = pushOverlay();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!isTopOverlay(overlayId)) return;
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) =>
          // Hidden inputs (RichEditor/gallery file pickers render
          // display:none <input type="file">s) would otherwise become dead
          // tab stops that swallow focus with nothing visibly highlighted.
          el.offsetParent !== null ||
          el === document.activeElement ||
          // SVG-backed elements and position:fixed nodes report a null
          // offsetParent despite being visible — keep them in.
          (el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden")
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === card)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      popOverlay(overlayId);
      // Give focus back to what opened the dialog — but only when focus is
      // still ours to move (inside the unmounting dialog, or lost to body).
      const active = document.activeElement;
      if ((card.contains(active) || active === document.body) && trigger?.focus) {
        trigger.focus();
      }
    };
  }, []);

  // Client-only by construction (all callers gate on client state), but
  // guard anyway so an SSR pass never touches `document`.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        backdropPressed.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (backdropPressed.current && e.target === e.currentTarget) onClose();
        backdropPressed.current = false;
      }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className={`card ${cardClassName}`}
        onClick={(e) => e.stopPropagation()}
        style={{ outline: "none" }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
