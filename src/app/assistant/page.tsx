"use client";

import { Chatty } from "@/components/Chatty";
import { SubPage } from "@/components/SubPage";

export default function AssistantPage() {
  return (
    <SubPage className="assistant-page max-w-[1600px]">
      <div className="w-full flex flex-col min-h-0 flex-1">
        <Chatty />
      </div>
    </SubPage>
  );
}
