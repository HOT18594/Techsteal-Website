import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";
import { MembersClient } from "./MembersClient";

export const metadata: Metadata = {
  title: "Members",
  description: `Community roster and online players on the ${siteConfig.name} Minecraft server.`,
};

export default function MembersPage() {
  return <MembersClient />;
}
