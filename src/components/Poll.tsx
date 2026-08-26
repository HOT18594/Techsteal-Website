"use client";

// Poll UI: <PollBuilder> for the admin thread composer (question, options,
// end date with quick presets) and <PollViewer> for the thread page (vote,
// live results with bars, countdown to the end date).

import { useEffect, useMemo, useState } from "react";
import type { ForumPoll } from "@/types";

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface PollDraft {
  question: string;
  options: string[];
  /** ISO timestamp. */
  endsAt: string;
}

export const EMPTY_POLL_DRAFT: PollDraft = { question: "", options: ["", ""], endsAt: "" };

export function pollDraftValid(d: PollDraft): boolean {
  const filled = d.options.map((o) => o.trim()).filter(Boolean);
  return (
    d.question.trim().length > 0 &&
    filled.length >= 2 &&
    Boolean(d.endsAt) &&
    new Date(d.endsAt).getTime() > Date.now()
  );
}

export function pollDraftPayload(d: PollDraft): { question: string; options: string[]; endsAt: string } {
  return {
    question: d.question.trim(),
    options: d.options.map((o) => o.trim()).filter(Boolean).slice(0, 10),
    endsAt: new Date(d.endsAt).toISOString(),
  };
}

export function PollBuilder({
  draft,
  onChange,
}: {
  draft: PollDraft;
  onChange: (d: PollDraft) => void;
}) {
  const setOption = (i: number, v: string) =>
    onChange({ ...draft, options: draft.options.map((o, n) => (n === i ? v : o)) });

  const preset = (days: number) => {
    const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    onChange({ ...draft, endsAt: localInputValue(d) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--diamond)]">
        <i className="fa-solid fa-square-poll-vertical" />
        Poll (members vote, one per account)
      </div>
      <input
        className="input"
        placeholder="Poll question — e.g. Next server event?"
        value={draft.question}
        maxLength={140}
        onChange={(e) => onChange({ ...draft, question: e.target.value })}
        aria-label="Poll question"
      />
      <div className="space-y-2">
        {draft.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 text-center text-xs text-[var(--muted-2)] flex-shrink-0">{i + 1}</span>
            <input
              className="input"
              placeholder={`Option ${i + 1}`}
              value={opt}
              maxLength={80}
              onChange={(e) => setOption(i, e.target.value)}
              aria-label={`Poll option ${i + 1}`}
            />
            {draft.options.length > 2 ? (
              <button
                type="button"
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--redstone)] hover:text-[var(--redstone)] transition"
                onClick={() =>
                  onChange({ ...draft, options: draft.options.filter((_, n) => n !== i) })
                }
                aria-label={`Remove option ${i + 1}`}
              >
                <i className="fa-solid fa-xmark text-xs" />
              </button>
            ) : null}
          </div>
        ))}
        {draft.options.length < 10 ? (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => onChange({ ...draft, options: [...draft.options, ""] })}
          >
            <i className="fa-solid fa-plus" /> Add option
          </button>
        ) : null}
      </div>
      <div>
        <label className="block text-xs text-[var(--muted)] mb-1.5" htmlFor="poll-ends">
          Poll ends
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            id="poll-ends"
            type="datetime-local"
            className="input flex-1 min-w-[12rem]"
            value={draft.endsAt ? toLocalInput(draft.endsAt) : ""}
            min={localInputValue(new Date(Date.now() + 60_000))}
            onChange={(e) => onChange({ ...draft, endsAt: e.target.value })}
          />
          {[
            { label: "1d", days: 1 },
            { label: "3d", days: 3 },
            { label: "1w", days: 7 },
          ].map((p) => (
            <button key={p.days} type="button" className="btn-ghost btn-sm" onClick={() => preset(p.days)}>
              +{p.label}
            </button>
          ))}
        </div>
        {draft.endsAt && new Date(draft.endsAt).getTime() <= Date.now() ? (
          <p className="text-xs text-[var(--redstone)] mt-1.5">The end date must be in the future.</p>
        ) : null}
      </div>
    </div>
  );
}

function toLocalInput(iso: string): string {
  return localInputValue(new Date(iso));
}

/** Format a Date for <input type="datetime-local"> (local time, minutes). */
function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------

function countdown(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "Final results";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Ends in under a minute";
  if (mins < 60) return `Ends in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `Ends in ${hours}h ${mins % 60}m`;
  return `Ends in ${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function PollViewer({
  poll,
  canVote,
  signedIn,
  onVote,
  bare = false,
}: {
  poll: ForumPoll;
  canVote: boolean;
  signedIn: boolean;
  onVote: (optionId: string) => Promise<void>;
  /** Render without the card wrapper (for use inside another card/modal). */
  bare?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Recompute the countdown label every 30s while open — this also flips
  // `ended` at the deadline even though the server snapshot is stale.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // Compute ended from endsAt NOW, not from the (possibly stale) server
  // snapshot — a poll sitting open in a tab must close itself at the
  // deadline without a refetch.
  const ended = new Date(poll.endsAt).getTime() <= Date.now();
  const total = useMemo(
    () => poll.totalVotes ?? Object.values(poll.counts ?? {}).reduce((a, b) => a + b, 0),
    [poll]
  );
  const voted = Boolean(poll.myVote);

  const vote = async (optionId: string) => {
    if (busy || ended || !canVote) return;
    setBusy(true);
    setError(null);
    try {
      await onVote(optionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't vote — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={bare ? "" : "card p-5 sm:p-6 mt-6 poll-card"} aria-label={`Poll: ${poll.question}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h3 className="font-display text-lg font-bold flex items-center gap-2">
          <i className="fa-solid fa-square-poll-vertical text-[var(--diamond)]" />
          {poll.question}
        </h3>
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full border px-2.5 py-1 flex-shrink-0 ${
            ended
              ? "text-[var(--muted)] border-[var(--border)]"
              : "text-[var(--diamond)] border-[var(--diamond)]/40 bg-[var(--diamond)]/10"
          }`}
        >
          <i className={`fa-solid ${ended ? "fa-flag-checkered" : "fa-hourglass-half"} text-[10px]`} />
          {countdown(poll.endsAt) || (ended ? "Final results" : "")}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {poll.options.map((opt) => {
          const count = poll.counts?.[opt.id] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const mine = poll.myVote === opt.id;
          // Results are visible once you've voted or the poll ended — AND
          // the server actually sent tallies (a poll that ends while this
          // tab is open stays bar-less until a refetch, instead of showing
          // false 0% bars).
          const showResults = (voted || ended) && poll.counts !== undefined;
          const clickable = canVote && !ended && !busy;

          return (
            <button
              key={opt.id}
              type="button"
              disabled={!clickable}
              onClick={() => void vote(opt.id)}
              className={`poll-option ${mine ? "mine" : ""}`}
              aria-label={`Vote: ${opt.text}${showResults ? ` — ${count} of ${total} votes` : ""}`}
            >
              <span className="poll-option-label">
                {showResults ? (
                  <i
                    className={`fa-solid ${mine ? "fa-circle-check" : "fa-circle"} text-xs ${
                      mine ? "text-[var(--diamond)]" : "text-[var(--muted-2)]"
                    }`}
                  />
                ) : (
                  <i className="fa-regular fa-circle text-xs text-[var(--muted-2)]" />
                )}
                <span className="truncate">{opt.text}</span>
              </span>
              {showResults ? (
                <span className="poll-option-result">
                  <span className="poll-option-bar" style={{ width: `${pct}%` }} aria-hidden="true" />
                  <span className="poll-option-pct">{pct}%</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap text-xs text-[var(--muted)]">
        <span>
          {total} {total === 1 ? "vote" : "votes"}
          {!ended && canVote && voted ? " · click another option to change yours" : ""}
        </span>
        {!signedIn ? <span>Sign in to vote.</span> : null}
        {signedIn && !canVote && !ended ? <span>Voting is unavailable.</span> : null}
      </div>
      {error ? <p className="text-xs text-[var(--redstone)] mt-2">{error}</p> : null}
    </div>
  );
}
