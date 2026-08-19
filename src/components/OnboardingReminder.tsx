"use client";

// Persistent reminder banner for users who haven't finished onboarding.
// Shows on every page for a signed-in user whose profile isn't onboarded yet,
// and keeps nagging until they complete it — like most sites' "verify your
// email" banners. A single dismissible variant would just get ignored, so we
// keep it visible across pages until they finish in Profile & Settings.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/use-session";

export function OnboardingReminder() {
  const { user, loading } = useSession();
  const pathname = usePathname();

  // Don't stack the banner on top of the onboarding/settings pages themselves —
  // users already there are handling it.
  if (loading || !user) return null;
  if (user.onboarded) return null;
  if (pathname === "/onboarding" || pathname === "/settings") return null;

  return (
    <div
      className="onboarding-reminder"
      role="status"
      aria-live="polite"
    >
      <i className="fa-solid fa-route" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">Finish setting up your profile</span>
        <span className="hidden sm:inline">
          {" "}
          — add your Minecraft username and verify your server role in one go.
        </span>
      </span>
      <Link href="/settings" className="onboarding-reminder-link">
        Complete setup
      </Link>
    </div>
  );
}