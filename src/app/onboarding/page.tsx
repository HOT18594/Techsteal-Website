import type { Metadata } from "next";
import { Suspense } from "react";
import { SubPage } from "@/components/SubPage";
import { OnboardingClient } from "./OnboardingClient";

export const metadata: Metadata = {
  title: "Onboarding",
  description: "Set up your profile and link your Minecraft username.",
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <SubPage className="max-w-2xl">
          <p className="text-sm text-[var(--muted)] text-center py-16">Loading…</p>
        </SubPage>
      }
    >
      <OnboardingClient />
    </Suspense>
  );
}
