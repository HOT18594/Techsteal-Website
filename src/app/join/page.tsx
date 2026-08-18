"use client";

import { useState } from "react";
import Link from "next/link";
import { siteConfig } from "@/lib/site";
import { useToast } from "@/components/Toast";
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
  const { show } = useToast();
  const [copied, setCopied] = useState(false);

  const copyIP = async () => {
    try {
      await navigator.clipboard.writeText(siteConfig.address);
      setCopied(true);
      show("Server address copied", siteConfig.address);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      show("Couldn't copy address", siteConfig.address);
    }
  };

  return (
    <SubPage className="mx-auto max-w-3xl pt-6 pb-16">
      <div className="max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="page-header mb-8">
          <span className="page-kicker">
            <i className="fa-solid fa-compass" aria-hidden="true" />
            Getting Started · {siteConfig.season}
          </span>
          <h1 className="page-title">How to Join</h1>
        </div>

        {/* Server address card */}
        <div className="card p-6 flex flex-col sm:flex-row items-center justify-between gap-5 mb-10">
          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Server address</div>
            <code className="font-display text-2xl text-[var(--accent)]">{siteConfig.address}</code>
          </div>
          <button className="btn-primary w-full sm:w-auto" onClick={copyIP}>
            {copied ? (
              <>
                <i className="fa-solid fa-check" />
                Copied!
              </>
            ) : (
              <>
                <i className="fa-solid fa-copy" />
                Copy Address
              </>
            )}
          </button>
        </div>

        {/* Steps */}
        <div className="space-y-4">
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

        {/* Need help? Ask Nova! */}
        <div className="mt-10 card p-8 text-center" style={{ background: "var(--bg-2)" }}>
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] text-white text-2xl mb-4">
            <i className="fa-solid fa-robot" />
          </div>
          <h2 className="font-display text-2xl font-bold mb-2">Need help? Ask Nova!</h2>
          <p className="text-[var(--muted)] max-w-md mx-auto mb-6">
            Stuck on a step, or have another question about the server? Nova can help.
          </p>
          <Link href="/assistant?ask=How+do+I+join%3F" className="btn-primary w-full sm:w-auto justify-center">
            <i className="fa-solid fa-comment-dots" />
            Ask Nova
          </Link>
        </div>
      </div>
    </SubPage>
  );
}