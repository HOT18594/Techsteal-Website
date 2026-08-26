// Tracks stacked overlays (modals, lightboxes, announcements) so Escape
// closes only the topmost one. Keydown handlers all live on `document`,
// where stopPropagation cannot stop sibling listeners — without this
// ordering, one Escape press slams shut every open overlay at once.
const stack: symbol[] = [];

export function pushOverlay(): symbol {
  const id = Symbol("overlay");
  stack.push(id);
  return id;
}

export function popOverlay(id: symbol): void {
  const i = stack.lastIndexOf(id);
  if (i !== -1) stack.splice(i, 1);
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
