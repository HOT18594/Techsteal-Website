"use client";

// Wraps page content so every route change replays a fast, subtle
// fade + slide-up entrance. Keyed by pathname, so client-side
// navigation between pages re-triggers the animation.

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function PageEnter({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter flex-1 min-h-0 flex flex-col">
      {children}
    </div>
  );
}
