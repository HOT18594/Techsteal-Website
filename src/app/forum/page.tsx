import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";
import { ForumClient } from "./ForumClient";

export const metadata: Metadata = {
  title: "Forum",
  description: `Community discussions, announcements, and polls for the ${siteConfig.name} Minecraft server.`,
};

export default function ForumPage() {
  return <ForumClient />;
}
