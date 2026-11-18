import type { Metadata } from "next";
import { getRules } from "@/lib/content-data";
import { siteConfig } from "@/lib/site";
import { RulesClient } from "./RulesClient";

// Server-render the rules so first paint (and crawlers/no-JS visitors) get
// real content instead of a skeleton + client fetch.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rules",
  description: `Server rules and community guidelines for the ${siteConfig.name} Minecraft server.`,
};

export default async function RulesPage() {
  const sections = await getRules();
  return <RulesClient initialSections={sections} />;
}
