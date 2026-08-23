"use client";

import { Chatty } from "@/components/Chatty";
import { SubPage } from "@/components/SubPage";

export default function AssistantPage() {
  return (
    <SubPage className="max-w-6xl">
      <div className="w-full flex flex-col min-h-0 flex-1">
        {/* Page header — the assistant's identity itself lives in Chatty's
            sidebar rail, so this stays a slim kicker + title. */}
        <div className="mb-6">
          <p className="page-kicker">
            <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
            Powered by live server tools
          </p>
          <h1 className="page-title">AI Assistant</h1>
        </div>
        <Chatty variant="full" />
      </div>
    </SubPage>
  );
}
