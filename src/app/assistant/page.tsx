"use client";

import { Chatty } from "@/components/Chatty";
import { SubPage } from "@/components/SubPage";

export default function AssistantPage() {
  return (
    <SubPage className="max-w-5xl">
      <div className="w-full flex flex-col min-h-0 flex-1">
        <Chatty variant="full" />
      </div>
    </SubPage>
  );
}
