import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { siteConfig } from "@/lib/site";
import { CopyIpButton } from "@/components/CopyIpButton";
import { SubPage } from "@/components/SubPage";

export const metadata: Metadata = {
  title: "How to Join",
  description: `Server address, whitelist info, and connection steps for ${siteConfig.name} (${siteConfig.season}).`,
};

const STEPS: Array<{ title: string; detail: ReactNode }> = [
  {
    title: "Link your Minecraft username",
    detail: (
      <>
        {siteConfig.name} is a whitelisted community server. Sign in with Discord and link your
        Java username in{" "}
        <Link href="/settings" className="text-[var(--accent)] hover:text-[var(--accent-bright)] transition">
          Profile &amp; Settings
        </Link>{" "}
        so you&apos;re on the member roster and whitelisted.
      </>
    ),
  },
  {
    title: "Open Minecraft Java Edition",
    detail: `Launch Java Edition ${siteConfig.version} (${siteConfig.software}) from your Minecraft Launcher.`,
  },
  {
    title: "Add the server in Multiplayer",
    detail: "From the main menu, click Multiplayer → Add Server, paste the address above, and click Done.",
  },
  {
    title: "Join and play",
    detail: siteConfig.seasonLive
      ? "Select the server to hop into the world — don't forget to read the rules first!"
      : `Once ${siteConfig.season} launches, select the server from your list to join right away.`,
  },
];

export default function JoinPage() {
  return (
    <SubPage className="max-w-3xl">
      <div className="w-full">
        {/* Header */}
        <div className="page-header mb-8">
          <h1 className="page-title">How to Join</h1>
        </div>

        {!siteConfig.seasonLive ? (
          <div className="card p-5 mb-6 flex items-start gap-3.5 border-[var(--border-strong)] bg-[var(--bg-2)]">
            <i className="fa-solid fa-hourglass-half text-[var(--accent)] mt-0.5" aria-hidden="true" />
            <div className="text-sm text-[var(--fg-2)] leading-relaxed">
              <strong className="text-[var(--fg)]">{siteConfig.season} is preparing to launch.</strong>{" "}
              The world isn&apos;t open yet, so you can&apos;t connect in-game right now — save the
              server address below and link your Minecraft account in{" "}
              <Link href="/settings" className="text-[var(--accent)] hover:text-[var(--accent-bright)] transition">
                Profile &amp; Settings
              </Link>{" "}
              so you&apos;re ready on opening day.
            </div>
          </div>
        ) : null}

        {/* Server address card */}
        <div className="card p-6 flex flex-col sm:flex-row items-center justify-between gap-5 mb-10">
          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Server address</div>
            <code className="font-display text-2xl text-[var(--accent)] break-all">{siteConfig.address}</code>
          </div>
          <CopyIpButton />
        </div>

        {/* Steps */}
        <ol className="space-y-4 stagger list-none m-0 p-0">
          {STEPS.map((step, i) => (
            <li key={i} className="card p-5 flex items-start gap-5 hover:border-[var(--accent)] transition-colors">
              <span
                className="font-display text-lg text-[var(--accent)] flex-shrink-0 w-8 text-right"
                aria-hidden="true"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-[var(--fg)] font-medium">{step.title}</p>
                <p className="text-sm text-[var(--muted)] mt-1">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* Need help? Arrow straight to Chatty Jr. */}
        <Link
          href="/assistant?ask=How+do+I+join%3F"
          className="mt-10 card p-8 text-center block hover:border-[var(--accent)] transition group"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[var(--accent-dim)] border border-[var(--border-strong)] text-[var(--accent)] rounded-[14px] text-2xl mb-4">
            <i className="fa-solid fa-robot" aria-hidden="true" />
          </div>
          <h2 className="font-display text-2xl font-bold mb-2">Need help? Ask {siteConfig.assistant.name}!</h2>
          <p className="text-[var(--muted)] max-w-md mx-auto mb-6">
            Stuck on a step, or have another question about the server?{" "}
            {siteConfig.assistant.name} can help.
          </p>
          <span className="btn-primary inline-flex w-full sm:w-auto justify-center">
            <i className="fa-solid fa-comment-dots" aria-hidden="true" />
            Ask {siteConfig.assistant.name}
            <i className="fa-solid fa-arrow-right transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </span>
        </Link>
      </div>
    </SubPage>
  );
}
