"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { SubPage } from "@/components/SubPage";
import { fallbackRules } from "@/lib/fallback-data";
import type { RuleSection } from "@/types";
import { useApi } from "@/lib/use-api";

export default function RulesPage() {
  const { show } = useToast();
  const { data: sections } = useApi<RuleSection[]>("/api/rules", fallbackRules);
  // Rules come from the same source the API/DB uses, so there's only one
  // copy to maintain going forward.
  const RULES = sections[0]?.rules ?? [];
  const [acknowledged, setAcknowledged] = useState(false);

  const acknowledge = () => {
    if (acknowledged) return;
    setAcknowledged(true);
    show("Rules acknowledged", "Thanks — welcome aboard.");
  };

  return (
    <SubPage className="mx-auto max-w-3xl pt-6 pb-16">
      <div className="max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="page-header mb-8">
          <span className="page-kicker">
            <i className="fa-solid fa-gavel" aria-hidden="true" />
            Code of Conduct · Rules
          </span>
          <h1 className="page-title">Techsteal Server Rules</h1>
        </div>

        {/* Intro */}
        <p className="mt-4 text-[var(--fg-2)]">
          React with{" "}
          <span className="inline-flex items-center gap-1.5 align-middle">
            <span className="text-lg" aria-hidden="true">
              🔥
            </span>
          </span>{" "}
          to acknowledge the rules. If you&apos;d like to suggest a change or new
          rule, let us know!
        </p>

        {/* Rules list */}
        <div className="mt-10 space-y-4">
          {RULES.map((rule, i) => (
            <div
              key={i}
              className="card p-5 flex items-start gap-5 hover:border-[var(--accent)] transition-colors"
            >
              <span className="font-display text-lg text-[var(--accent)] flex-shrink-0 w-8 text-right">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-[var(--fg)] font-medium">{rule}</p>
            </div>
          ))}
        </div>

        {/* Acknowledge */}
        <div className="mt-10 card p-6 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="text-center sm:text-left">
            <p className="font-display text-lg font-bold">
              Read everything above?
            </p>
            <p className="text-sm text-[var(--muted)] mt-1">
              Confirm you accept the rules before playing.
            </p>
          </div>
          <button
            className={`btn-primary ${acknowledged ? "opacity-90" : ""}`}
            onClick={acknowledge}
            disabled={acknowledged}
          >
            {acknowledged ? (
              <>
                <i className="fa-solid fa-check" />
                Acknowledged
              </>
            ) : (
              <>
                <span aria-hidden="true">🔥</span>
                Acknowledge
              </>
            )}
          </button>
        </div>

        {/* @everyone footer */}
        <div className="mt-8 text-center">
          <code className="inline-block px-4 py-1.5 rounded-lg bg-[var(--bg-2)] border border-[var(--border)] text-sm text-[var(--accent)] font-display">
            @everyone
          </code>
        </div>
      </div>
    </SubPage>
  );
}