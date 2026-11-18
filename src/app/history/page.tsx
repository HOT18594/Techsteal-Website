import type { Metadata } from "next";
import { getTimeline } from "@/lib/content-data";
import { siteConfig } from "@/lib/site";
import { HistoryClient } from "./HistoryClient";

// Server-render the timeline so first paint (and crawlers/no-JS visitors)
// get real content instead of a skeleton + client fetch.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "History",
  description: `Seasons, milestones, and community moments from the ${siteConfig.name} Minecraft server.`,
};

export default async function HistoryPage() {
  const events = await getTimeline();
  return <HistoryClient initialEvents={events} />;
}
