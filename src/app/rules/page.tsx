"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

interface Rule {
  title: string;
  detail: string;
}

const RULES: Rule[] = [
  {
    title: "No unfair client modifications.",
    detail: "",
  },
  {
    title: "Hack clients or mods that give unfair advantages",
    detail:
      "(e.g. minimaps) are not allowed. Mods that aid building or improve visuals (e.g. full-bright) are fine.",
  },
  {
    title: "Raiding and griefing are part of the game",
    detail:
      "but don't go overboard. Structures near world spawn are protected and must not be damaged.",
  },
  {
    title: "Lag machines, chunk bans, and any other intentional server disruption",
    detail: "are strictly prohibited.",
  },
  {
    title: "Combat logging is not allowed.",
    detail:
      "While there's no plugin to prevent it, offenders can be reported.",
  },
  {
    title: "Crystal PvP is only allowed",
    detail: "if both parties agree beforehand.",
  },
  {
    title: "No bullying or harassment.",
    detail: "Keep interactions fun and respectful for everyone.",
  },
  {
    title: "Spawn killing is not permitted.",
    detail: "Give players a fair chance after respawn.",
  },
  {
    title: "Severe enough offences will lead to immediate ban.",
    detail: "",
  },
];

export default function RulesPage() {
  const { show } = useToast();
  const [acknowledged, setAcknowledged] = useState(false);

  const acknowledge = () => {
    if (acknowledged) return;
    setAcknowledged(true);
    show("Rules acknowledged", "Thanks — welcome aboard.");
  };

  return (
    <section className="px-6 lg:px-10 pt-24 lg:pt-28">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <h1 className="font-display text-4xl md:text-5xl font-bold">Techsteal Server Rules</h1>

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
              <div>
                <p className="text-[var(--fg)] font-medium">
                  {rule.title}
                  {rule.detail && (
                    <span className="text-[var(--muted)] font-normal"> — {rule.detail}</span>
                  )}
                </p>
              </div>
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
    </section>
  );
}