"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { siteConfig } from "@/lib/site";
import { useToast } from "@/components/Toast";
import { SubPage } from "@/components/SubPage";
import { useSession } from "@/lib/use-session";
import type { Account } from "@/types";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const { show } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: sessionLoading, refresh } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<Account[]>([]);

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
    };
    show("Sign-in failed", messages[error] ?? "Something went wrong.");
  }, [searchParams, show]);

  // Load the demo accounts to offer as sign-in options.
  useEffect(() => {
    fetch("/api/auth/demo-accounts")
      .then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((data) => setDemoAccounts(data.accounts ?? []))
      .catch(() => {});
  }, []);

  const signIn = async (accountId: string) => {
    if (busy) return;
    setBusy(accountId);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      if (!res.ok) {
        show("Couldn't sign in", "Unknown account.");
        return;
      }
      await refresh();
      show("Signed in", "Welcome back.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <SubPage className="items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="card p-8">
          {/* Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] text-white text-2xl mb-4">
              <i className="fa-solid fa-dice" />
            </div>
            <h1 className="font-display text-2xl font-bold">{siteConfig.name}</h1>
            <p className="text-sm text-[var(--muted)] mt-2">
              Sign in to access member features.
            </p>
          </div>

          {/* Discord OAuth — starts the real login flow */}
          <a
            href="/api/auth/discord"
            className="w-full inline-flex items-center justify-center gap-3 rounded-lg px-4 py-3 font-semibold text-white transition-all duration-200 hover:brightness-110"
            style={{
              background: "#5865F2",
              boxShadow: "0 8px 24px -8px rgba(88, 101, 242, 0.6)",
            }}
          >
            <i className="fa-brands fa-discord text-lg" />
            Continue with Discord
          </a>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--muted-2)] uppercase tracking-wider">Demo accounts</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {/* Demo accounts — sign in as a role to test the system */}
          <div className="space-y-2">
            {demoAccounts.length === 0 ? (
              <p className="text-center text-xs text-[var(--muted-2)] py-2">
                Loading demo accounts…
              </p>
            ) : (
              demoAccounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => void signIn(account.id)}
                  disabled={busy === account.id}
                  className="w-full flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-4 py-3 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-dim)] disabled:opacity-60"
                >
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center font-display font-bold text-white text-sm flex-shrink-0">
                    {account.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{account.username}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {account.role === "admin" ? "Admin" : "Member"}
                    </div>
                  </div>
                  {busy === account.id ? (
                    <i className="fa-solid fa-spinner fa-spin text-[var(--accent)]" />
                  ) : (
                    <i className="fa-solid fa-arrow-right text-[var(--muted)]" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Note */}
          <p className="text-center text-xs text-[var(--muted-2)] mt-6">
            Discord login is the real auth path and is coming soon.
          </p>
        </div>
      </div>
    </SubPage>
  );
}