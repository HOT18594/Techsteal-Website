import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";
import { StatusClient } from "./StatusClient";

export const metadata: Metadata = {
  title: "Server Status",
  description: `Live status, online players, and connection details for the ${siteConfig.name} Minecraft server (${siteConfig.season}).`,
};

export default function StatusPage() {
  return <StatusClient />;
}
