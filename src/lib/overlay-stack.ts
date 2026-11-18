// Tracks stacked overlays (modals, lightboxes, announcements) so Escape
// closes only the topmost one, and reference-counts body scroll lock so
// out-of-order unmounts never strand `document.body.style.overflow`.
const stack: symbol[] = [];
let savedOverflow: string | null = null;

export function pushOverlay(): symbol {
  const wasEmpty = stack.length === 0;
  const id = Symbol("overlay");
  stack.push(id);
  if (wasEmpty && typeof document !== "undefined") {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  return id;
}

export function popOverlay(id: symbol): void {
  const i = stack.lastIndexOf(id);
  if (i === -1) return;
  stack.splice(i, 1);
  if (stack.length === 0 && typeof document !== "undefined") {
    document.body.style.overflow = savedOverflow ?? "";
    savedOverflow = null;
  }
}

/** True when `id` is the topmost overlay — only it may react to Escape. */
export function isTopOverlay(id: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id;
}

/** True while ANY registered overlay is open. Non-overlay Escape handlers
 * (e.g. the navbar popover) must stand down while this is true: their
 * document-level listener can't be stopped by a dialog, and closing the
 * popover + refocusing its button on top of an open dialog both shuts two
 * things with one press and breaks the dialog's focus trap. */
export function hasOpenOverlays(): boolean {
  return stack.length > 0;
}
