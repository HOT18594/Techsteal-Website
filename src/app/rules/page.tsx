import { getRules } from "@/lib/content-data";
import { RulesClient } from "./RulesClient";

// Server-render the rules so first paint (and crawlers/no-JS visitors) get
// real content instead of a skeleton + client fetch.
export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const sections = await getRules();
  return <RulesClient initialSections={sections} />;
}
