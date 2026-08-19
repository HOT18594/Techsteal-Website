"use client";

import { Chatty } from "@/components/Chatty";
import { SubPage } from "@/components/SubPage";

export default function AssistantPage() {
  return (
    <SubPage className="mx-auto max-w-5xl pt-6 pb-16">
      <div className="w-full flex flex-col min-h-0 flex-1">
        <Chatty variant="full" />
      </div>
    </SubPage>
  );
}
