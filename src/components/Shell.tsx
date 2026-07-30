"use client";

import { usePathname } from "next/navigation";
import AppShell, { type AppPage } from "@/components/AppShell";

// Route → app page. The shell lives in the root layout so it persists across
// navigations: the sidebar mounts once per page load instead of remounting
// (and re-animating) on every route change.
const ROUTE_TO_PAGE: Record<string, AppPage> = {
  "/": "home",
  "/join": "join",
  "/community": "community",
  "/blog": "blog",
  "/settings": "settings",
};

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const page = ROUTE_TO_PAGE[pathname] ?? "home";
  return <AppShell page={page}>{children}</AppShell>;
}
