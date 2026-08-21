"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { siteConfig } from "@/lib/site";
import { useToast } from "@/components/Toast";
import { SubPage } from "@/components/SubPage";
import { useSession } from "@/lib/use-session";

export default function LoginPage() {
  return (
    <Suspense fallback={<SubPage className="items-center justify-center"><p className="text-sm text-[var(--muted)] py-16">Loading…</p></SubPage>}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const { show } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: sessionLoading } = useSession();

  // Where to land after login (gated CTAs pass ?next=/their/page). Only
  // same-site relative paths are honored.
  const rawNext = searchParams.get("next");
  const nextParam = rawNext?.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

  // Already logged in? Go straight to the right page.
  useEffect(() => {
    if (!sessionLoading && user) {
      router.replace(user.role === "admin" ? "/admin" : "/");
    }
  }, [user, sessionLoading, router]);

  // Show a toast if the Discord callback bounced us back with an error.
  useEffect(() => {
    const error = searchParams.get("error");
    if (!error) return;
    const messages: Record<string, string> = {
      discord_not_configured: "Discord login isn't set up yet.",
      state_mismatch: "That sign-in link was stale — try again.",
      oauth_failed: "Discord didn't let us in. Try again.",
      banned: "This account was removed from the server by an admin.",
    };
    show("Sign-in failed", messages[error] ?? "Something went wrong.", "error");
  }, [searchParams, show]);

  return (
    <SubPage className="items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="card p-8">
          {/* Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#5865F2] text-white text-3xl mb-4 shadow-[0_10px_30px_-10px_rgba(88,101,242,0.7)]">
              <i className="fa-brands fa-discord" />
            </div>
            <h1 className="font-display text-2xl font-bold">{siteConfig.name}</h1>
            <p className="text-sm text-[var(--muted)] mt-2">
              Sign in with Discord to access member features.
            </p>
          </div>

          {/* Discord OAuth — the only way in. Forwards ?next= so the
              callback can return the user to the page they came from. */}
          <a
            href={`/api/auth/discord${
              nextParam ? `?next=${encodeURIComponent(nextParam)}` : ""
            }`}
            className="btn-primary w-full justify-center"
            style={{ background: "#5865F2" }}
          >
            <i className="fa-brands fa-discord text-lg" />
            Continue with Discord
          </a>

          {/* Note */}
          <p className="text-center text-xs text-[var(--muted-2)] mt-6">
            First time here? You&apos;ll be nudged to link your Minecraft account after
            signing in.
          </p>
        </div>
      </div>
    </SubPage>
  );
}
