"use client";

// Poll announcements: when a signed-in user arrives and an admin has an
// ACTIVE poll running that this user hasn't voted in or dismissed, pop a
// modal announcement (same pattern as the onboarding reminder — it appears
// across the site until handled). Voting works right inside the popup.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PollViewer } from "@/components/Poll";
import { Modal } from "@/components/Modal";
import { useSession } from "@/lib/use-session";
import { useToast } from "@/components/Toast";
import { categoryClass } from "@/lib/forum-categories";
import type { ForumPoll } from "@/types";

type ActivePoll = ForumPoll & { threadTitle: string; threadCategory: string };

const DISMISS_KEY = "techsteal-poll-dismissed";

function dismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function rememberDismissed(pollId: number) {
  try {
    const ids = dismissedIds();
    ids.add(String(pollId));
    // Keep the list bounded — old polls never come back anyway.
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...ids].slice(-50)));
  } catch {
    // localStorage unavailable (private mode etc.) — the popup just
    // reappears next visit, which is acceptable.
  }
}

export function PollAnnouncement() {
  const { user, loading } = useSession();
  const { show } = useToast();
  const [poll, setPoll] = useState<ActivePoll | null>(null);
  const [ready, setReady] = useState(loading);
  // Polls this session already engaged with (voted in). The myVote guard
  // below must only hide polls that were voted in BEFORE the page loaded —
  // without this, voting inline would set myVote and instantly close the
  // popup before the user sees their results.
  const [engaged, setEngaged] = useState<Set<number>>(new Set());

  // Fetch the latest active poll once the session is known (the response
  // includes the user's vote, so "already voted" can skip the popup).
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setReady(true);
      return;
    }
    let cancelled = false;
    fetch("/api/polls/active")
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        const data = (await res.json()) as { poll: ActivePoll | null };
        if (cancelled) return;
        setPoll(data.poll);
      })
      .catch(() => {
        /* network hiccup — no announcement this visit */
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  const close = useCallback(() => {
    if (poll) rememberDismissed(poll.id);
    setPoll(null);
  }, [poll]);

  // Single source of truth for whether the announcement is actually shown.
  // The scroll-lock effect below must key off this too — previously it only
  // checked `poll`, so a fetched-but-hidden poll (already voted/dismissed,
  // guarded during render AFTER hooks) locked body scroll with nothing
  // rendered to close it.
  const visible =
    ready && !loading && !!user && !!poll &&
    // Already voted in this poll BEFORE this page load → not an
    // announcement for them anymore. (Votes cast inside this popup keep it
    // open via `engaged` so the user sees the results.)
    !(poll !== null && poll.myVote && !engaged.has(poll.id)) &&
    // Dismissed earlier → stays dismissed until a NEW poll starts.
    !(poll !== null && dismissedIds().has(String(poll.id)));

  // Escape closes the announcement; lock body scroll while it's up.
  useEffect(() => {
    if (!visible || !poll) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [visible, poll, close]);

  if (!visible || !poll) return null;

  const castVote = async (optionId: string) => {
    const res = await fetch(`/api/forum/${poll.threadId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId }),
    });
    const data = (await res.json().catch(() => ({}))) as { poll?: ForumPoll; error?: string };
    if (!res.ok || !data.poll) {
      throw new Error(data.error ?? "Couldn't vote — try again.");
    }
    setEngaged((prev) => new Set(prev).add(poll.id));
    setPoll((p) => (p ? { ...p, ...data.poll } : p));
    show("Vote counted", "Thanks — results are in the thread.");
    // NOTE: no rememberDismissed here — the dismissal guard runs every
    // render and would instantly close the popup before results show.
    // After voting, the myVote check keeps the announcement away on later
    // visits anyway.
  };

  return (
    <Modal
      label={`Announcement: poll ${poll.question}`}
      onClose={close}
      cardClassName="p-6 w-full max-w-lg poll-announce"
    >
      <div>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--diamond)]">
              <i className="fa-solid fa-bullhorn" />
              Poll announcement
            </p>
            <p className="text-sm text-[var(--muted)] mt-1 flex items-center gap-2 flex-wrap">
              <span
                className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${categoryClass(poll.threadCategory)}`}
              >
                {poll.threadCategory}
              </span>
              in <Link href={`/forum/${poll.threadId}`} className="text-[var(--accent-bright)] hover:underline">{poll.threadTitle}</Link>
            </p>
          </div>
          <button
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
            onClick={close}
            aria-label="Dismiss announcement"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Vote right here — no page hop needed. */}
        <div className="poll-announce-body">
          <PollViewer poll={poll} canVote signedIn onVote={castVote} />
        </div>

        <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
          <Link href={`/forum/${poll.threadId}`} className="btn-secondary btn-sm" onClick={close}>
            <i className="fa-regular fa-comments" />
            Open discussion
          </Link>
          <button className="btn-ghost btn-sm" onClick={close}>
            Maybe later
          </button>
        </div>
      </div>
    </Modal>
  );
}
