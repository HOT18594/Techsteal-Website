import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { getLaunchState } from "@/lib/launch";
import { siteConfig } from "@/lib/site";
import { CopyIpButton } from "@/components/CopyIpButton";
import { JoinLaunchBanner, JoinPlaySentence } from "@/components/JoinLaunchNotice";
import { ModpackDownload } from "@/components/ModpackDownload";
import { SubPage } from "@/components/SubPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How to Join",
  description: `Download the ${siteConfig.season} modpack, install it with your preferred launcher, and join ${siteConfig.name}.`,
};

type LauncherGuide = {
  name: string;
  logo: string;
  href: string;
  linkLabel: string;
  badge?: string;
  steps: ReactNode[];
};

const LAUNCHER_GUIDES: LauncherGuide[] = [
  {
    name: "Prism Launcher",
    logo: "/logos/prism-launcher.svg",
    href: "https://prismlauncher.org/download/",
    linkLabel: "Get Prism Launcher",
    badge: "Recommended",
    steps: [
      "Open Prism Launcher and sign in with your Microsoft/Minecraft account if prompted.",
      "Click Add Instance in the top-left, then open the Import tab.",
      "Choose the downloaded ZIP from your computer and click OK. Keep the file zipped.",
      "Wait for Prism to finish downloading the pack files, then launch the new instance.",
    ],
  },
  {
    name: "CurseForge",
    logo: "/logos/curseforge.svg",
    href: "https://www.curseforge.com/download/app",
    linkLabel: "Get CurseForge",
    badge: "ZIP import",
    steps: [
      "Open the CurseForge app and select Minecraft.",
      "Click Create Custom Profile, then choose Import Profile .zip (shown as Import on some versions).",
      "Choose the downloaded ZIP and let CurseForge install the profile and its files.",
      "If CurseForge asks about unhosted files, choose All Files so the mods bundled with the pack are kept.",
      "When installation finishes, click Play on the new profile.",
    ],
  },
  {
    name: "Minecraft Launcher",
    logo: "/logos/minecraft-launcher.svg",
    href: "https://www.minecraft.net/en-us/download",
    linkLabel: "Get Minecraft Launcher",
    badge: "Manual setup",
    steps: [
      <>
        Download and run the{" "}
        <a
          href="https://fabricmc.net/use/installer/"
          target="_blank"
          rel="noreferrer"
          className="text-[var(--accent)] hover:text-[var(--accent-bright)] underline underline-offset-2"
        >
          Fabric installer
        </a>
        . Select Minecraft {siteConfig.version}, then click Install.
      </>,
      "Open Minecraft Launcher → Java Edition → Installations. Edit the new Fabric installation and set its Game Directory to a new, empty folder for TECHSTEAL.",
      "Extract the ZIP into that folder so mods, config, and the other pack folders sit directly inside it. If the ZIP has an overrides folder, extract that folder's contents instead.",
      `Select the Fabric ${siteConfig.version} installation and click Play.`,
    ],
  },
  {
    name: "Modrinth App",
    logo: "/logos/modrinth.svg",
    href: "https://modrinth.com/app",
    linkLabel: "Get Modrinth",
    badge: "Manual setup",
    steps: [
      "Open the Modrinth App, click + to create a new instance, and choose a custom instance.",
      `Name it ${siteConfig.name}, select ${siteConfig.software} as the loader and ${siteConfig.version} as the game version, then create it.`,
      "Open the instance's three-dot menu and choose Open folder.",
      "Extract the ZIP directly into that folder. If it has an overrides folder, extract that folder's contents instead.",
      "Return to the Modrinth App and click Play.",
    ],
  },
];

export default async function JoinPage() {
  const initialLaunch = await getLaunchState();

  return (
    <SubPage className="max-w-5xl">
      <div className="w-full">
        <div className="page-header mb-8">
          <h1 className="page-title">How to Join</h1>
          <p className="text-[var(--fg-2)] max-w-2xl leading-relaxed">
            Download the {siteConfig.season} client pack, set it up with your preferred launcher,
            and hop into {siteConfig.name}.
          </p>
        </div>

        <JoinLaunchBanner initialLaunch={initialLaunch} />

        <section aria-labelledby="download-pack" className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-display text-lg text-[var(--accent)]" aria-hidden="true">01</span>
            <h2 id="download-pack" className="font-display text-2xl font-bold">Download the client pack</h2>
          </div>
          <div className="card p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="hidden sm:flex items-center justify-center w-12 h-12 flex-shrink-0 bg-[var(--accent-dim)] border border-[var(--border-strong)] text-[var(--accent)] rounded-[14px] text-xl">
                  <i className="fa-solid fa-file-zipper" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[var(--fg)]">{siteConfig.season} modpack</h3>
                  <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
                    The mods and settings needed for our server, bundled into one download.
                  </p>
                </div>
              </div>
              <ModpackDownload />
            </div>
            <p className="text-xs text-[var(--muted)] mt-5 leading-relaxed">
              <i className="fa-solid fa-circle-check mr-1.5 text-[var(--emerald)]" aria-hidden="true" />
              Open to everyone — anyone on the site (including guests) can download the pack with no
              sign-in or Discord verification required, and {siteConfig.name} has no whitelist.
            </p>
            <div className="flex flex-wrap gap-2 mt-6">
              {["Java Edition", `Minecraft ${siteConfig.version}`, siteConfig.software, "ZIP file"].map((label) => (
                <span key={label} className="px-3 py-1 rounded-full border border-[var(--border)] bg-[var(--bg-2)] text-xs text-[var(--fg-2)]">
                  {label}
                </span>
              ))}
            </div>
            <p className="text-xs text-[var(--muted)] mt-5 leading-relaxed">
              For Prism Launcher and CurseForge, keep the file zipped and import it directly.
              For the official Minecraft Launcher or Modrinth App, follow the manual extraction
              steps below.
            </p>
          </div>
        </section>

        <section aria-labelledby="install-pack" className="mb-12">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-display text-lg text-[var(--accent)]" aria-hidden="true">02</span>
            <h2 id="install-pack" className="font-display text-2xl font-bold">Install with your launcher</h2>
          </div>
          <p className="text-sm text-[var(--muted)] mb-5 ml-10">
            Choose one launcher. Prism and CurseForge offer the simplest ZIP import.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {LAUNCHER_GUIDES.map((guide) => (
              <article key={guide.name} className="card p-5 sm:p-6 flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-5">
                  <div className="flex items-center gap-3">
                    <span className="w-11 h-11 flex items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)]">
                      <Image src={guide.logo} alt="" width={30} height={30} className="w-[30px] h-[30px] object-contain" />
                    </span>
                    <h3 className="font-semibold text-[var(--fg)]">{guide.name}</h3>
                  </div>
                  {guide.badge ? (
                    <span className="px-2.5 py-1 rounded-full border border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--muted)] whitespace-nowrap">
                      {guide.badge}
                    </span>
                  ) : null}
                </div>
                <ol className="list-decimal pl-5 space-y-3 text-sm text-[var(--fg-2)] leading-relaxed marker:text-[var(--accent)] marker:font-medium flex-1">
                  {guide.steps.map((step, index) => (
                    <li key={index} className="pl-1">{step}</li>
                  ))}
                </ol>
                <a
                  href={guide.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-bright)] mt-6 self-start"
                >
                  {guide.linkLabel}
                  <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                </a>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="join-server" className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-display text-lg text-[var(--accent)]" aria-hidden="true">03</span>
            <h2 id="join-server" className="font-display text-2xl font-bold">Join the server</h2>
          </div>
          <div className="card p-6 sm:p-8">
            <ol className="space-y-6 list-none m-0 p-0">
              <li className="flex items-start gap-4">
                <span className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full border border-[var(--border-strong)] text-xs font-semibold text-[var(--accent)]">1</span>
                <div>
                  <h3 className="font-medium text-[var(--fg)]">Use your Minecraft Java account</h3>
                  <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
                    You&apos;ll need Minecraft: Java Edition. {siteConfig.name} has no whitelist,
                    so you don&apos;t need to link your username or get approved before joining.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <span className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full border border-[var(--border-strong)] text-xs font-semibold text-[var(--accent)]">2</span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-[var(--fg)]">Add TECHSTEAL to Multiplayer</h3>
                  <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
                    Launch the installed pack, then click Multiplayer → Add Server. Name it {siteConfig.name}{" "}
                    and use this address:
                  </p>
                  <div className="mt-4 p-4 rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <code className="font-display text-lg sm:text-xl text-[var(--accent)] break-all">{siteConfig.address}</code>
                    <CopyIpButton />
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <span className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full border border-[var(--border-strong)] text-xs font-semibold text-[var(--accent)]">3</span>
                <div>
                  <h3 className="font-medium text-[var(--fg)]">Join and play</h3>
                  <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
                    Click Done, select {siteConfig.name}, and click Join Server.{" "}
                    <JoinPlaySentence initialLive={initialLaunch.seasonLive} />{" "}
                    Please read the{" "}
                    <Link href="/rules" className="text-[var(--accent)] hover:text-[var(--accent-bright)]">
                      server rules
                    </Link>{" "}
                    first.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <Link
          href={`/assistant?ask=${encodeURIComponent(`How do I install the ${siteConfig.season} modpack?`)}`}
          className="card p-8 text-center block hover:border-[var(--accent)] transition group"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[var(--accent-dim)] border border-[var(--border-strong)] text-[var(--accent)] rounded-[14px] text-2xl mb-4">
            <i className="fa-solid fa-robot" aria-hidden="true" />
          </div>
          <h2 className="font-display text-2xl font-bold mb-2">Need help? Ask {siteConfig.assistant.name}!</h2>
          <p className="text-[var(--muted)] max-w-md mx-auto mb-6">
            Stuck on an install step or having trouble connecting? {siteConfig.assistant.name} can help.
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
