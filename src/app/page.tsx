import { Metadata } from "next";
import { HeroClient } from "@/components/HeroClient";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: `${siteConfig.name} — Private Minecraft Server`,
  description: `Official website for the ${siteConfig.name} private Minecraft server.`,
};

export default function Home() {
  return (
    <HeroClient />
  );
}