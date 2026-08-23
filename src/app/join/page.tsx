"use client";

import Link from "next/link";
import { siteConfig } from "@/lib/site";
import { CopyIpButton } from "@/components/CopyIpButton";
import { SubPage } from "@/components/SubPage";

const STEPS = [
  {
    title: "Open Minecraft",
    detail: "Make sure you're on the right version — the server runs on Java Edition.",
  },
  {
    title: "Go to Multiplayer",
    detail: "From the main menu, click Multiplayer → Add Server.",
  },
  {
    title: "Paste the address",
    detail: "Enter the server IP below as the server address, then click Done.",
  },
  {
    title: "Join and play",
    detail: "Click the server, log in with your Microsoft account, and you're in.",
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

        {/* Server address card */}
        <div className="card p-6 flex flex-col sm:flex-row items-center justify-between gap-5 mb-10">
          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Server address</div>
            <code className="font-display text-2xl text-[var(--accent)]">{siteConfig.address}</code>
          </div>
          <CopyIpButton />
        </div>

        {/* Steps */}
        <div className="space-y-4 stagger">
          {STEPS.map((step, i) => (
            <div key={i} className="card p-5 flex items-start gap-5 hover:border-[var(--accent)] transition-colors">
              <span className="font-display text-lg text-[var(--accent)] flex-shrink-0 w-8 text-right">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-[var(--fg)] font-medium">{step.title}</p>
                <p className="text-sm text-[var(--muted)] mt-1">{step.detail}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Need help? Arrow straight to Chatty Jr. */}
        <Link
          href="/assistant?ask=How+do+I+join%3F"
          className="mt-10 card p-8 text-center block hover:border-[var(--accent)] hover:-translate-y-0.5 transition group"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] text-white text-2xl mb-4">
            <i className="fa-solid fa-robot" />
          </div>
          <h2 className="font-display text-2xl font-bold mb-2">Need help? Ask {siteConfig.assistant.name}!</h2>
          <p className="text-[var(--muted)] max-w-md mx-auto mb-6">
            Stuck on a step, or have another question about the server?{" "}
            {siteConfig.assistant.name} can help.
          </p>
          <span className="btn-primary inline-flex w-full sm:w-auto justify-center">
            <i className="fa-solid fa-comment-dots" />
            Ask {siteConfig.assistant.name}
            <i className="fa-solid fa-arrow-right transition-transform group-hover:translate-x-1" />
          </span>
        </Link>
      </div>
    </SubPage>
  );
}
