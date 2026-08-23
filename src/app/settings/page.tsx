"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/components/Toast";
import { SubPage } from "@/components/SubPage";
import { useSession } from "@/lib/use-session";
import type { Account } from "@/types";

export default function SettingsPage() {
  return (
    <Suspense fallback={<SubPage className="max-w-3xl"><p className="text-sm text-[var(--muted)] text-center py-16">Loading profile…</p></SubPage>}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { show } = useToast();
  const router = useRouter();
  const { user, loading: sessionLoading, refresh } = useSession();

  const [profile, setProfile] = useState<Account | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Minecraft username editing
  const [mcUsername, setMcUsername] = useState("");
  const [mcSkin, setMcSkin] = useState<string | null>(null);
  const [mcBusy, setMcBusy] = useState(false);
  const [mcSaved, setMcSaved] = useState(false);

  // Admin code
  const [adminCode, setAdminCode] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);

  // Discord verify
  const [verifyState, setVerifyState] = useState<"idle" | "checking" | "verified" | "not_configured">("idle");

  // Not signed in? Send to login.
  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [user, sessionLoading, router]);

  // Load the full profile.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch("/api/profile")
      // A 500/503 must reach the catch (toast + keep the form) — mapping it
      // to `{ profile: null }` here would blank the profile and flip every
      // badge to "Setup incomplete" on a transient server error.
      .then((r) => {
        if (!r.ok) throw new Error(`profile ${r.status}`);
        return r.json() as Promise<{ profile: Account | null }>;
      })
      .then((data) => {
        if (cancelled) return;
        const p = data.profile as Account | null;
        setProfile(p);
        setMcUsername(p?.minecraftUsername ?? "");
        setMcSkin(p?.minecraftUsername ? skinUrl(p.minecraftUsername) : null);
      })
      .catch(() => {
        if (!cancelled) show("Couldn't load profile", "Check your connection and try again.", "error");
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, show]);

  const patch = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error();
    const data = (await res.json()) as { profile: Account };
    setProfile(data.profile);
    return data.profile;
  };

  const saveMinecraft = async () => {
    const name = mcUsername.trim();
    if (mcBusy) return;
    setMcBusy(true);
    setMcSaved(false);
    try {
      // If a name was typed, validate it against Mojang first.
      if (name) {
        const res = await fetch(`/api/minecraft/skin?username=${encodeURIComponent(name)}`);
        const data = (await res.json()) as { skin?: string; error?: string };
        if (!res.ok || !data.skin) {
          show("Unknown username", data.error ?? "That Minecraft username doesn't exist.", "error");
          return;
        }
        setMcSkin(data.skin);
      } else {
        setMcSkin(null);
      }
      // Setting a Minecraft username is the key onboarding step — mark the
      // account onboarded so the reminder banner stops nagging. (Explicitly
      // clearing it to empty still counts, matching "done enough".)
      await patch({ minecraftUsername: name || null, onboarded: true });
      setMcSaved(true);
      await refresh();
      show("Saved", name ? `Minecraft: ${name}` : "Minecraft username cleared.");
    } catch {
      show("Couldn't save", "Something went wrong.", "error");
    } finally {
      setMcBusy(false);
    }
  };

  const claimAdmin = async () => {
    if (!adminCode.trim() || adminBusy) return;
    setAdminBusy(true);
    try {
      // Direct fetch (not `patch`, which throws away the error body) so a
      // wrong code shows the server's message — the API now 403s on a miss.
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminCode: adminCode.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        profile?: Account;
        error?: string;
      };
      setAdminCode("");
      if (res.ok && data.profile?.role === "admin") {
        await refresh();
        show("Admin unlocked", "Welcome to the admin team. 🔑");
      } else {
        show("Wrong code", data.error ?? "That admin code isn't right.");
      }
    } catch {
      show("Couldn't check code", "Try again in a moment.", "error");
    } finally {
      setAdminBusy(false);
    }
  };

  const verifyDiscord = async () => {
    setVerifyState("checking");
    try {
      const res = await fetch("/api/auth/discord/verify", { method: "POST" });
      if (!res.ok) {
        setVerifyState("idle");
        show("Couldn't verify", "Something went wrong — try again in a moment.");
        return;
      }
      const data = (await res.json()) as { configured: boolean; verified: boolean };
      if (!data.configured) {
        setVerifyState("not_configured");
      } else if (data.verified) {
        // The verify endpoint persists the badge itself — no PATCH needed.
        setVerifyState("verified");
        show("Verified", "You're a member of the official server.");
      } else {
        setVerifyState("idle");
        show("Not verified", "Join the official server, then try again.");
      }
    } catch {
      setVerifyState("idle");
      show("Couldn't reach the server", "Check your connection and try again.");
    }
  };

  const isAdmin = user?.role === "admin" || profile?.role === "admin";
  const inputClass =
    "w-full bg-[var(--bg-2)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)] transition placeholder:text-[var(--muted-2)] rounded-lg";

  if (loadingProfile) {
    return (
      <SubPage className="max-w-3xl">
        <p className="text-sm text-[var(--muted)] text-center py-16">Loading profile…</p>
      </SubPage>
    );
  }

  return (
    <SubPage className="max-w-3xl">
      <div className="w-full">
        {/* Header */}
        <div className="page-header mb-8">
          <h1 className="page-title">Profile &amp; Settings</h1>
        </div>

        {/* Identity card */}
        <div className="card p-6 mb-6 flex items-center gap-5">
          <Avatar
            name={profile?.username ?? user?.username ?? "?"}
            src={profile?.avatarUrl}
            size="lg"
            className="w-16! h-16! flex-shrink-0"
          />
          <div className="min-w-0">
            <div className="font-display text-xl font-bold break-words leading-snug">{profile?.username ?? user?.username}</div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span
                className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${
                  isAdmin
                    ? "bg-[var(--accent-dim)] border-[var(--accent)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--muted)]"
                }`}
              >
                {isAdmin ? "Admin" : "Member"}
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${
                  profile?.discordVerified
                    ? "bg-[var(--emerald)]/10 border-[var(--emerald)]/40 text-[var(--emerald)]"
                    : "border-[var(--border)] text-[var(--muted-2)]"
                }`}
              >
                {profile?.discordVerified ? "Discord verified" : "Discord unverified"}
              </span>
              {profile?.onboarded ? (
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border border-[var(--emerald)]/40 text-[var(--emerald)]">
                  Onboarded
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border border-[var(--diamond)]/40 text-[var(--diamond)]">
                  Setup incomplete
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Minecraft username */}
        <div className="card p-6 mb-6">
          <h2 className="font-display text-lg font-bold mb-1 flex items-center gap-2">
            <i className="fa-solid fa-cube text-[var(--accent)]" />
            Minecraft
          </h2>
          <p className="text-sm text-[var(--muted)] mb-5">
            Your in-game username and character skin, shown on your profile.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            {mcSkin ? (
              <img
                src={mcSkin}
                alt="Minecraft skin"
                width={56}
                height={56}
                className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-2)] flex-shrink-0"
                style={{ imageRendering: "pixelated" }}
              />
            ) : (
              <div className="w-14 h-14 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--bg-2)] flex items-center justify-center text-[var(--muted-2)] flex-shrink-0">
                <i className="fa-solid fa-user" />
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full">
              <input
                className={inputClass}
                placeholder="Minecraft username"
                value={mcUsername}
                onChange={(e) => {
                  setMcUsername(e.target.value);
                  setMcSaved(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveMinecraft();
                }}
              />
              <button
                className="btn-primary flex-shrink-0"
                onClick={() => void saveMinecraft()}
                disabled={mcBusy}
              >
                {mcBusy ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-floppy-disk" />}
                {mcSaved ? "Saved!" : "Save"}
              </button>
            </div>
          </div>
        </div>

        {/* Discord verification */}
        <div className="card p-6 mb-6">
          <h2 className="font-display text-lg font-bold mb-1 flex items-center gap-2">
            <i className="fa-brands fa-discord text-[var(--accent)]" />
            Discord
          </h2>
          <p className="text-sm text-[var(--muted)] mb-5">
            Verify you&apos;re a member of the official server — it unlocks AI access,
            Gallery posting, and Server Control, and shows the badge on your profile.
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div
              className={`flex-1 rounded-xl border px-4 py-3 text-sm ${
                verifyState === "verified" || profile?.discordVerified
                  ? "border-[var(--emerald)]/40 bg-[var(--emerald)]/10 text-[var(--emerald)]"
                  : "border-[var(--border)] bg-[var(--bg-2)] text-[var(--muted)]"
              }`}
            >
              {verifyState === "checking" ? (
                <span className="flex items-center gap-2">
                  <i className="fa-solid fa-spinner fa-spin text-[var(--accent)]" /> Checking…
                </span>
              ) : verifyState === "verified" || profile?.discordVerified ? (
                <span className="flex items-center gap-2">
                  <i className="fa-solid fa-circle-check" /> Verified member
                </span>
              ) : verifyState === "not_configured" ? (
                <span className="flex items-center gap-2">
                  <i className="fa-solid fa-triangle-exclamation" /> Verification isn&apos;t set up yet
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <i className="fa-solid fa-user-check" /> Not verified yet
                </span>
              )}
            </div>
            <button
              className="btn-secondary flex-shrink-0"
              onClick={() => void verifyDiscord()}
              disabled={verifyState === "checking" || profile?.discordVerified}
            >
              <i className="fa-solid fa-rotate" />
              {profile?.discordVerified ? "Verified" : "Verify"}
            </button>
          </div>
        </div>

        {/* Admin code */}
        {!isAdmin ? (
          <div className="card p-6 mb-6">
            <h2 className="font-display text-lg font-bold mb-1 flex items-center gap-2">
              <i className="fa-solid fa-key text-[var(--accent)]" />
              Admin access
            </h2>
            <p className="text-sm text-[var(--muted)] mb-5">
              Have the admin code? Enter it to unlock the Manage Panel.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="password"
                className={inputClass}
                placeholder="Admin code"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void claimAdmin();
                }}
              />
              <button
                className="btn-primary flex-shrink-0"
                onClick={() => void claimAdmin()}
                disabled={adminBusy || !adminCode.trim()}
              >
                {adminBusy ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-key" />}
                Unlock
              </button>
            </div>
          </div>
        ) : (
          <div className="card p-6 mb-6">
            <h2 className="font-display text-lg font-bold mb-1 flex items-center gap-2">
              <i className="fa-solid fa-shield-halved text-[var(--accent)]" />
              Admin access
            </h2>
            <p className="text-sm text-[var(--muted)]">
              You&apos;re an admin. Manage roles and permissions in the{" "}
              <Link href="/admin" className="text-[var(--accent)] hover:text-[var(--accent-bright)] transition">
                Manage Panel
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </SubPage>
  );
}

/** Skin avatar URL for a Minecraft username (minotar, no key needed). */
function skinUrl(username: string): string {
  return `https://minotar.net/helm/${encodeURIComponent(username)}/64.png`;
}
