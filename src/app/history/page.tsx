import { getTimeline } from "@/lib/content-data";
import { HistoryClient } from "./HistoryClient";

// Server-render the timeline so first paint (and crawlers/no-JS visitors)
// get real content instead of a skeleton + client fetch.
export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const events = await getTimeline();
  return <HistoryClient initialEvents={events} />;
}
