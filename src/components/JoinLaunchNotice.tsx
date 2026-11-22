"use client";

import { useLaunchState } from "@/components/LaunchProvider";
import { formatLaunchEastern, type LaunchState } from "@/lib/launch-shared";
import { siteConfig } from "@/lib/site";

export function JoinLaunchBanner({ initialLaunch }: { initialLaunch: LaunchState }) {
  const { launch } = useLaunchState();
  const active = launch.configured ? launch : initialLaunch;

  if (active.seasonLive) return null;

  const launchTime = active.enabled ? formatLaunchEastern(active.launchAt, "full") : "";

  return (
    <div className="card p-5 mb-6 flex items-start gap-3.5 border-[var(--border-strong)] bg-[var(--bg-2)]">
      <i className="fa-solid fa-hourglass-half text-[var(--accent)] mt-0.5" aria-hidden="true" />
      <div className="text-sm text-[var(--fg-2)] leading-relaxed">
        <strong className="text-[var(--fg)]">{siteConfig.season} opens soon.</strong>{" "}
        {launchTime
          ? `Launch is scheduled for ${launchTime} Eastern. `
          : ""}
        Install the pack now so you&apos;re ready when the world opens. You won&apos;t be
        able to connect before launch.
      </div>
    </div>
  );
}

export function JoinPlaySentence({ initialLive }: { initialLive: boolean }) {
  const { launch } = useLaunchState();
  const live = launch.configured ? launch.seasonLive : initialLive;

  return (
    <>
      {live
        ? "The world is open — see you in game!"
        : `You can save the server now and join when ${siteConfig.season} opens.`}
    </>
  );
}
