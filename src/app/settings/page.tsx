import type { Metadata } from "next";
import { Suspense } from "react";
import { SubPage } from "@/components/SubPage";
import { SettingsClient } from "./SettingsClient";

export const metadata: Metadata = {
  title: "Profile & Settings",
  description: "Manage your profile, color palette, Discord verification, and Minecraft account.",
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <SubPage className="max-w-3xl">
          <p className="text-sm text-[var(--muted)] text-center py-16">Loading profile…</p>
        </SubPage>
      }
    >
      <SettingsClient />
    </Suspense>
  );
}
