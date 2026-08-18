"use client";

import { useState } from "react";
import { siteConfig } from "@/lib/site";
import { useToast } from "@/components/Toast";
import { SubPage } from "@/components/SubPage";

export default function LoginPage() {
  const { show } = useToast();
  const [busy, setBusy] = useState(false);

  const startDiscord = () => {
    if (busy) return;
    setBusy(true);
    // Placeholder — real Discord OAuth will be wired up later.
    setTimeout(() => {
      setBusy(false);
      show("Discord login coming soon", "We'll connect the real flow shortly.");
    }, 600);
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
              Sign in with Discord to get started.
            </p>
          </div>

          {/* Discord button */}
          <button
            onClick={startDiscord}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-3 rounded-lg px-4 py-3 font-semibold text-white transition-all duration-200 disabled:opacity-70"
            style={{
              background: "#5865F2",
              boxShadow: "0 8px 24px -8px rgba(88, 101, 242, 0.6)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "#4752c4";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "#5865F2";
            }}
          >
            <i className="fa-brands fa-discord text-lg" />
            {busy ? "Connecting…" : "Continue with Discord"}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--muted-2)] uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {/* Sign up / log in toggle note */}
          <p className="text-center text-sm text-[var(--muted)]">
            New here?{" "}
            <button
              onClick={startDiscord}
              className="text-[var(--accent)] hover:text-[var(--accent-bright)] transition"
            >
              Sign up with Discord
            </button>{" "}
            — it only takes a second.
          </p>
        </div>

        <p className="text-center text-xs text-[var(--muted-2)] mt-6">
          Authentication is not wired up yet — this is a placeholder.
        </p>
      </div>
    </SubPage>
  );
}