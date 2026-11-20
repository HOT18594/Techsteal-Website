"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { siteConfig } from "@/lib/site";
import { useToast } from "@/components/Toast";
import { SubPage } from "@/components/SubPage";
import { useSession } from "@/lib/use-session";
import { safeNextPath } from "@/lib/safe-next";

export function LoginClient() {
  const { show } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: sessionLoading, refresh } = useSession();

  // Where to land after login (gated CTAs pass ?next=/their/page). Only
  // same-site relative paths are honored (same validator the API enforces).
  const nextParam = safeNextPath(searchParams.get("next"));

  // Already logged in? Go straight to where they were heading — admins
  // default to their panel, but an explicit ?next= still wins.
  useEffect(() => {
    if (!sessionLoading && user) {
      router.replace(nextParam ?? (user.role === "admin" ? "/admin" : "/"));
    }
  }, [user, sessionLoading, router, nextParam]);

  // Guest login (shared password, no Discord needed).
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestPassword, setGuestPassword] = useState("");
  const [guestBusy, setGuestBusy] = useState(false);

  const guestLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guestBusy || !guestPassword.trim()) return;
    setGuestBusy(true);
    try {
      const res = await fetch("/api/auth/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: guestPassword, name: guestName }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        show("Guest sign-in failed", data.error ?? "Something went wrong.", "error");
        return;
      }
      await refresh();
      // The effect above redirects once the session shows up.
    } catch {
      show("Couldn't reach the server", "Check your connection and try again.", "error");
    } finally {
      setGuestBusy(false);
    }
  };

  // Show a toast if the Discord callback bounced us back with an error.
  const errorToastShown = useRef(false);
  useEffect(() => {
    const error = searchParams.get("error");
    if (!error || errorToastShown.current) return;
    errorToastShown.current = true;
    const messages: Record<string, string> = {
      discord_not_configured: "Discord login isn't set up yet.",
      state_mismatch: "That sign-in link was stale — try again.",
      oauth_failed: "Discord didn't let us in. Try again.",
      banned: "This account was removed from the server by an admin.",
    };
    const message = Object.hasOwn(messages, error) ? messages[error] : undefined;
    show("Sign-in failed", message ?? "Something went wrong.", "error");
    // Strip the param so a refresh doesn't replay the toast.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("error");
    const qs = params.toString();
    router.replace(qs ? `/login?${qs}` : "/login", { scroll: false });
  }, [searchParams, show, router]);

  return (
    <SubPage className="items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="card p-8">
          {/* Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-[14px] bg-[#5865F2] text-white text-3xl mb-4">
              <i className="fa-brands fa-discord" aria-hidden="true" />
            </div>
            <h1 className="font-display text-2xl font-bold">{siteConfig.name}</h1>
            <p className="text-sm text-[var(--muted)] mt-2">
              Sign in with Discord — or continue as a guest — to access member features.
            </p>
          </div>

          {/* Discord OAuth — explicit white-on-blurple contrast */}
          <a
            href={`/api/auth/discord${
              nextParam ? `?next=${encodeURIComponent(nextParam)}` : ""
            }`}
            className="btn-primary w-full justify-center !bg-[#5865F2] hover:!bg-[#4752c4] !text-white"
          >
            <i className="fa-brands fa-discord text-lg" aria-hidden="true" />
            Continue with Discord
          </a>

          {/* Guest login */}
          <div className="flex items-center gap-3 my-5 text-xs text-[var(--muted-2)]">
            <span className="flex-1 h-px bg-[var(--border)]" />
            or
            <span className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {!guestOpen ? (
            <button
              type="button"
              className="btn-secondary w-full justify-center"
              onClick={() => setGuestOpen(true)}
            >
              <i className="fa-solid fa-user-secret text-lg" aria-hidden="true" />
              Continue as guest
            </button>
          ) : (
            <form onSubmit={guestLogin} className="flex flex-col gap-3">
              <input
                aria-label="Display name (optional)"
                className="input"
                placeholder="Display name (optional)"
                maxLength={20}
                autoComplete="nickname"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
              <input
                aria-label="Guest password"
                type="password"
                className="input"
                placeholder="Guest password"
                autoComplete="off"
                autoFocus
                value={guestPassword}
                onChange={(e) => setGuestPassword(e.target.value)}
              />
              <button
                type="submit"
                className="btn-primary w-full justify-center"
                disabled={guestBusy || !guestPassword.trim()}
              >
                {guestBusy ? (
                  <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                ) : (
                  <i className="fa-solid fa-right-to-bracket" aria-hidden="true" />
                )}
                Sign in as guest
              </button>
            </form>
          )}
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
