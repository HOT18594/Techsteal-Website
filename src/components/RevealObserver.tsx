"use client";

import { useEffect } from "react";

const REVEAL_SELECTOR = ".reveal:not(.visible), .stagger:not(.visible)";

export function RevealObserver() {
  useEffect(() => {
    const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            io?.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.1 }
    );
    const observeElement = (element: Element) => {
      if (io) io.observe(element);
      else element.classList.add("visible");
    };
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
      });
    });
    mo?.observe(document.body, { childList: true, subtree: true });

    return () => {
      io?.disconnect();
      mo?.disconnect();
      if (scheduled !== 0) cancelAnimationFrame(scheduled);
      addedRoots.clear();
    };
  }, []);

  return null;
}
