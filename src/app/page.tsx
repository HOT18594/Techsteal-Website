import type { Metadata } from "next";
import { HeroClient } from "@/components/HeroClient";
import { getLaunchState } from "@/lib/launch";
import { siteConfig } from "@/lib/site";
import "./home.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const launch = await getLaunchState();
  return {
    description: `Official website for the ${siteConfig.name} private Minecraft server — ${siteConfig.season} is ${launch.seasonLive ? "live now" : "coming soon"}. Join at ${siteConfig.address}.`,
  };
}

export default async function Home() {
  const initialLaunch = await getLaunchState();
  return <HeroClient initialLaunch={initialLaunch} />;
}
