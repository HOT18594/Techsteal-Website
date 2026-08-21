"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { siteConfig } from "@/lib/site";
import { useToast } from "@/components/Toast";
import { SubPage } from "@/components/SubPage";
import { useSession } from "@/lib/use-session";

const STEPS = ["Admin code", "Discord server", "Minecraft"];

export default function OnboardingPage() {
  return (
    <Suspense fallback={<SubPage className="max-w-2xl"><p className="text-sm text-[var(--muted)] text-center py-16">Loading…</p></SubPage>}>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const { show } = useToast();
  const router = useRouter();
  const { user, loading: sessionLoading, refresh } = useSession();

  const [step, setStep] = useState(0);
  const [adminCode, setAdminCode] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminDone, setAdminDone] = useState(false);

  const [verifyState, setVerifyState] = useState<"idle" | "checking" | "verified" | "skipped" | "not_configured">("idle");

  const [mcUsername, setMcUsername] = useState("");
  const [mcBusy, setMcBusy] = useState(false);
  const [mcSkin, setMcSkin] = useState<string | null>(null);
  const [mcError, setMcError] = useState("");

  // Not signed in? Send to login.
  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [user, sessionLoading, router]);

  // Auto-check Discord membership when reaching step 2.
  useEffect(() => {
    if (step !== 1) return;
    void checkDiscord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const claimAdmin = async () => {
    if (!adminCode.trim() || adminBusy) return;
    setAdminBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminCode: adminCode.trim() }),
      });
      // Double-check the server actually promoted us (not just a 200).
      const data = (await res.json().catch(() => ({}))) as { profile?: { role?: string } };
      if (res.ok && data.profile?.role === "admin") {
        setAdminDone(true);
        await refresh();
        show("Admin unlocked", "Welcome to the admin team. 🔑");
      } else {
        show("Wrong code", "That admin code isn't right.");
      }
    } catch {
      show("Couldn't check code", "Try again in a moment.");
    } finally {
      setAdminBusy(false);
    }
  };

  const checkDiscord = async () => {
    setVerifyState("checking");
    try {
      const res = await fetch("/api/auth/discord/verify", { method: "POST" });
      if (!res.ok) {
        // Auth failure / server error — NOT "not configured". Re-check so
        // the user can try again instead of being told setup is missing.
        setVerifyState("idle");
        show("Couldn't verify", "Something went wrong — try again in a moment.");
        return;
      }
      const data = (await res.json()) as { configured: boolean; verified: boolean };
      if (!data.configured) {
        setVerifyState("not_configured");
      } else if (data.verified) {
        // The verify endpoint persists the badge server-side — no PATCH.
        setVerifyState("verified");
      } else {
        setVerifyState("idle"); // offer a manual re-check
        show("Not in the server yet", "Join the official server, then verify.");
      }
    } catch {
      setVerifyState("idle");
      show("Couldn't reach the server", "Check your connection and try again.");
    }
  };

  const resolveSkin = async () => {
    const name = mcUsername.trim();
    if (!name || mcBusy) return;
    setMcBusy(true);
    setMcError("");
    try {
      const res = await fetch(`/api/minecraft/skin?username=${encodeURIComponent(name)}`);
      const data = (await res.json()) as { skin?: string; error?: string };
      if (!res.ok || !data.skin) {
        setMcError(data.error ?? "Couldn't find that username.");
        setMcSkin(null);
      } else {
        setMcSkin(data.skin);
      }
    } catch {
      setMcError("Couldn't reach Mojang. Try again.");
    } finally {
      setMcBusy(false);
    }
  };

  const finish = async () => {
    const patchBody: Record<string, unknown> = { onboarded: true };
    if (mcUsername.trim()) patchBody.minecraftUsername = mcUsername.trim();
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchBody),
    });
    if (!res.ok) {
      show("Couldn't save", "Something went wrong finishing up.");
      return;
    }
    await refresh();
    show("Welcome aboard", "Your profile is set up!");
    router.push("/");
  };

  const inputClass =
    "w-full bg-[var(--bg-2)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)] transition placeholder:text-[var(--muted-2)] rounded-lg";

  return (
    <SubPage className="max-w-2xl">
      <div className="w-full">
        {/* Header */}
        <div className="page-header mb-8">
          <h1 className="page-title">Let&apos;s get you set up</h1>
          <p className="text-sm text-[var(--muted)]">
            A few optional steps — you can change everything later in{" "}
            <Link href="/settings" className="text-[var(--accent)] hover:text-[var(--accent-bright)] transition">
              Profile & Settings
            </Link>
            .
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border transition ${
                  i < step
                    ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                    : i === step
                      ? "border-[var(--accent)] text-[var(--accent)] shadow-[0_0_14px_-4px_var(--accent-glow)]"
                      : "border-[var(--border)] text-[var(--muted-2)]"
                }`}
              >
                {i < step ? <i className="fa-solid fa-check" /> : i + 1}
              </div>
              <span
                className={`text-xs font-semibold uppercase tracking-wider hidden sm:block ${
                  i <= step ? "text-[var(--fg-2)]" : "text-[var(--muted-2)]"
                }`}
              >
                {label}
              </span>
              {i < STEPS.length - 1 ? (
                <div className={`flex-1 h-px ${i < step ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />
              ) : null}
            </div>
          ))}
        </div>

        {/* Step 1 — Admin code */}
        {step === 0 ? (
          <div className="card p-8">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent-dim)] border border-[var(--border-strong)] flex items-center justify-center text-xl text-[var(--accent)] mb-5">
              <i className="fa-solid fa-key" />
            </div>
            <h2 className="font-display text-2xl font-bold mb-2">Want admin powers?</h2>
            <p className="text-sm text-[var(--muted)] mb-6">
              If you have the admin code, enter it to unlock the admin role and the{" "}
              <span className="text-[var(--fg-2)]">Manage Panel</span>. No code? Skip —
              you can claim it later in settings.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="password"
                className={inputClass}
                placeholder="Admin code (optional)"
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
                {adminBusy ? "Checking…" : adminDone ? "Unlocked!" : "Claim"}
              </button>
            </div>
            {adminDone ? (
              <p className="text-xs text-[var(--emerald)] mt-3 flex items-center gap-1.5">
                <i className="fa-solid fa-circle-check" /> Admin role unlocked.
              </p>
            ) : null}
            <div className="flex justify-end mt-6">
              <button className="btn-secondary" onClick={() => setStep(1)}>
                Continue <i className="fa-solid fa-arrow-right" />
              </button>
            </div>
          </div>
        ) : null}

        {/* Step 2 — Discord server verification */}
        {step === 1 ? (
          <div className="card p-8">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent-dim)] border border-[var(--border-strong)] flex items-center justify-center text-xl text-[var(--accent)] mb-5">
              <i className="fa-brands fa-discord" />
            </div>
            <h2 className="font-display text-2xl font-bold mb-2">Are you in the official server?</h2>
            <p className="text-sm text-[var(--muted)] mb-6">
              Verifying unlocks all member perks — the AI assistant, Gallery posting, and
              Server Control. We can check right now if you&apos;re in the official{" "}
              {siteConfig.name} Discord server. Not in it yet? Join first, then verify.
            </p>

            <div
              className={`rounded-xl border px-5 py-4 mb-6 flex items-center gap-3 ${
                verifyState === "verified"
                  ? "border-[var(--emerald)]/40 bg-[var(--emerald)]/10 text-[var(--emerald)]"
                  : verifyState === "not_configured"
                    ? "border-[var(--border)] bg-[var(--bg-2)] text-[var(--muted)]"
                    : "border-[var(--border)] bg-[var(--bg-2)] text-[var(--muted)]"
              }`}
            >
              <i
                className={`text-lg ${
                  verifyState === "checking"
                    ? "fa-solid fa-spinner fa-spin text-[var(--accent)]"
                    : verifyState === "verified"
                      ? "fa-solid fa-circle-check"
                      : "fa-solid fa-user-check"
                }`}
              />
              <div className="text-sm">
                {verifyState === "checking" ? "Checking membership…" : null}
                {verifyState === "verified" ? "Verified — you're a member. ✅" : null}
                {verifyState === "not_configured"
                  ? "Verification isn't set up yet — you can skip for now."
                  : null}
                {verifyState === "idle" || verifyState === "skipped"
                  ? "Not verified yet."
                  : null}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {verifyState !== "verified" ? (
                <button
                  className="btn-primary"
                  onClick={() => void checkDiscord()}
                  disabled={verifyState === "checking"}
                >
                  <i className="fa-solid fa-rotate" />
                  {verifyState === "checking" ? "Checking…" : "Verify now"}
                </button>
              ) : null}
              <button
                className="btn-secondary"
                onClick={() => {
                  setVerifyState("skipped");
                  setStep(2);
                }}
              >
                Skip <i className="fa-solid fa-arrow-right" />
              </button>
            </div>
          </div>
        ) : null}

        {/* Step 3 — Minecraft username */}
        {step === 2 ? (
          <div className="card p-8">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent-dim)] border border-[var(--border-strong)] flex items-center justify-center text-xl text-[var(--accent)] mb-5">
              <i className="fa-solid fa-cube" />
            </div>
            <h2 className="font-display text-2xl font-bold mb-2">What&apos;s your Minecraft username?</h2>
            <p className="text-sm text-[var(--muted)] mb-6">
              Add your in-game name and we&apos;ll fetch your character skin. It shows up on
              your profile and can be changed anytime.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <input
                className={inputClass}
                placeholder="Minecraft username (optional)"
                value={mcUsername}
                onChange={(e) => setMcUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void resolveSkin();
                }}
              />
              <button
                className="btn-secondary flex-shrink-0"
                onClick={() => void resolveSkin()}
                disabled={mcBusy || !mcUsername.trim()}
              >
                {mcBusy ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-magnifying-glass" />}
                Fetch skin
              </button>
            </div>

            {mcSkin ? (
              <div className="flex items-center gap-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-2)] p-4 mb-5">
                <img
                  src={mcSkin}
                  alt={`${mcUsername} skin`}
                  width={64}
                  height={64}
                  className="rounded-lg border border-[var(--border)]"
                  style={{ imageRendering: "pixelated" }}
                />
                <div>
                  <div className="font-display font-bold text-lg">{mcUsername}</div>
                  <div className="text-xs text-[var(--muted)]">Skin loaded from Mojang</div>
                </div>
              </div>
            ) : null}
            {mcError ? (
              <p className="text-xs text-[var(--redstone)] mb-5">{mcError}</p>
            ) : null}

            <div className="flex flex-col sm:flex-row justify-between gap-3 mt-2">
              <button className="btn-secondary" onClick={() => setStep(1)}>
                <i className="fa-solid fa-arrow-left" /> Back
              </button>
              <button className="btn-primary" onClick={() => void finish()}>
                <i className="fa-solid fa-check" />
                Finish &amp; save
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </SubPage>
  );
}
