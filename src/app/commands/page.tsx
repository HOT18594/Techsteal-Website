import type { Metadata } from "next";
import { PublicCommandsBoard } from "@/components/PublicCommandsBoard";
import { SubPage } from "@/components/SubPage";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Command Log",
  description: `Permanent public anti-cheat command ledger for ${siteConfig.name} (${siteConfig.season}) — every gamemode switch, /give, /effect, and server command archived forever.`,
};

export default function CommandsPage() {
  return (
    <SubPage className="max-w-[1320px]">
      <header className="mb-7">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--muted)]">
          {siteConfig.name} / {siteConfig.season} · Public Transparency
        </span>
        <h1 className="mt-2 text-[clamp(32px,4vw,48px)] font-semibold tracking-[-0.055em] leading-[1.1] text-[var(--fg)]">
          Public command log
        </h1>
        <p className="mt-2.5 max-w-2xl text-sm text-[var(--muted)]">
          A permanent, read-only record of every gamemode change, item spawn, effect, teleport,
          and server command executed on the realm.
        </p>
      </header>
      <PublicCommandsBoard />
    </SubPage>
  );
}
