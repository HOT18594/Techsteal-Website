import type { Metadata } from "next";
import { Chatty } from "@/components/Chatty";
import { SubPage } from "@/components/SubPage";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: siteConfig.assistant.name,
  description: `Ask ${siteConfig.assistant.name} about ${siteConfig.name} server status, rules, builds, forum threads, and Minecraft.`,
};

export default function AssistantPage() {
  return (
    <SubPage className="assistant-page max-w-[1600px]">
      <div className="w-full flex flex-col min-h-0 flex-1">
        <Chatty />
      </div>
    </SubPage>
  );
}
