import type { Metadata } from "next";
import { Suspense } from "react";
import { SubPage } from "@/components/SubPage";
import { siteConfig } from "@/lib/site";
import { LoginClient } from "./LoginClient";

export const metadata: Metadata = {
  title: "Log in",
  description: `Sign in with Discord or as a guest to access ${siteConfig.name} member features.`,
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <SubPage className="items-center justify-center">
          <p className="text-sm text-[var(--muted)] py-16">Loading…</p>
        </SubPage>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
