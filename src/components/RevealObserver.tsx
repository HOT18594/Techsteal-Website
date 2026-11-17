"use client";

import { useEffect } from "react";

const REVEAL_SELECTOR = ".reveal:not(.visible), .stagger:not(.visible)";

export function RevealObserver() {
  useEffect(() => {
    // threshold must stay 0: a tall .stagger container (rules, forum, gallery)
    // can be >10x the viewport height on short/zoomed screens, so any positive
    // threshold is unreachable and the list stays opacity:0 forever.
    const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            io?.unobserve(entry.target);
          }
        }
      },
      { threshold: 0 }
    );
    const observeElement = (element: Element) => {
      if (io) io.observe(element);
      else element.classList.add("visible");
    };
    // Safety net. Several lists (member directory, gallery, forum) mount their
    // `.stagger` container *after* the data fetch resolves, and an element that
    // is inserted and scrolled past in the same frame can miss its
    // IntersectionObserver callback — leaving the whole list at opacity 0 with
    // nothing on screen. Anything already inside the viewport is revealed
    // directly, which makes the animation a nicety rather than a hard gate on
    // the content ever being visible.
    const sweep = () => {
      document.querySelectorAll(REVEAL_SELECTOR).forEach((element) => {
        const rect = element.getBoundingClientRect();
        const inView = rect.top < window.innerHeight && rect.bottom > 0;
        if (inView) element.classList.add("visible");
      });
    };
    let sweepFrame = 0;
    const queueSweep = () => {
      if (sweepFrame !== 0) return;
      sweepFrame = requestAnimationFrame(() => {
        sweepFrame = 0;
        sweep();
      });
    };
    sweep();
    // A delayed pass covers content that mounts after the fetch settles.
    const settleTimer = window.setTimeout(() => {
      sweep();
      sweepFrame = 0;
    }, 1200);
    window.addEventListener("scroll", queueSweep, { passive: true });
    window.addEventListener("resize", queueSweep);
    window.addEventListener("load", queueSweep);
    const observeTree = (root: ParentNode) => {
      if (root instanceof Element && root.matches(REVEAL_SELECTOR)) observeElement(root);
      root.querySelectorAll(REVEAL_SELECTOR).forEach(observeElement);
    };

    observeTree(document.body);

    // Scan only newly mounted element subtrees. Streaming text mutations
    // don't add elements and therefore never schedule document-wide queries.
    const addedRoots = new Set<Element>();
    let scheduled = 0;
    const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) addedRoots.add(node);
        }
      }
      if (!addedRoots.size || scheduled !== 0) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = 0;
        for (const root of addedRoots) {
          if (!root.isConnected) continue;
          // A parent in this batch already covers its descendants.
          let covered = false;
          for (let parent = root.parentElement; parent; parent = parent.parentElement) {
            if (addedRoots.has(parent)) { covered = true; break; }
          }
          if (!covered) observeTree(root);
        }
        addedRoots.clear();
        // New nodes may already be in view; reveal them without waiting for
        // an intersection callback that may never arrive.
        sweep();
      });
    });
    mo?.observe(document.body, { childList: true, subtree: true });

    // Printing never fires IntersectionObserver — reveal everything so a
    // printed page isn't blank below the first viewport.
    const revealAll = () => {
      document.querySelectorAll(REVEAL_SELECTOR).forEach((el) => el.classList.add("visible"));
    };
    window.addEventListener("beforeprint", revealAll);

    return () => {
      io?.disconnect();
      mo?.disconnect();
      window.removeEventListener("beforeprint", revealAll);
      window.removeEventListener("scroll", queueSweep);
      window.removeEventListener("resize", queueSweep);
      window.removeEventListener("load", queueSweep);
      window.clearTimeout(settleTimer);
      if (scheduled !== 0) cancelAnimationFrame(scheduled);
      if (sweepFrame !== 0) cancelAnimationFrame(sweepFrame);
      addedRoots.clear();
    };
  }, []);

  return null;
}
