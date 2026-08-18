"use client";

import { fallbackMembers } from "@/lib/fallback-data";
import type { Member } from "@/types";
import { SubPage } from "@/components/SubPage";
import { useApi } from "@/lib/use-api";

export default function MembersPage() {
  const { data: members } = useApi<Member[]>("/api/members", fallbackMembers);

  const online = members.filter((m) => m.status === "online").length;
  const offline = members.length - online;

  return (
    <SubPage className="mx-auto max-w-7xl pt-6 pb-16">
      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="page-header rowed mb-8">
          <div>
            <span className="page-kicker">
              <i className="fa-solid fa-users" aria-hidden="true" />
              Community · Members
            </span>
            <h1 className="page-title">Members</h1>
          </div>
          <div className="flex items-center gap-6 text-sm text-[var(--muted)]">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[var(--emerald)] rounded-full shadow-[0_0_8px_var(--emerald-glow)]" />
              {online} online
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[var(--muted-2)] rounded-full" />
              {offline} offline
            </span>
          </div>
        </div>

        {members.length === 0 ? (
          <div className="text-sm text-[var(--muted)] py-16 text-center border border-dashed border-[var(--border)] rounded-xl">
            <i className="fa-solid fa-users text-3xl text-[var(--muted-2)] mb-4 block" />
            No members listed yet.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {members.map((m) => (
              <div key={m.id ?? m.name} className="member-card p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="relative">
                    <div className={`avatar avatar-lg ${m.color}`}>{m.avatar}</div>
                    <div className={m.status === "online" ? "status-online" : "status-offline"} />
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[var(--muted)] uppercase tracking-wider">Joined</div>
                    <div className="font-display text-sm">{m.joined}</div>
                  </div>
                </div>

                <h3 className="font-display text-lg font-bold mb-3">{m.name}</h3>

                <div className="pt-3 border-t border-[var(--border)] flex justify-between items-center">
                  <span className="text-sm text-[var(--accent)]">{m.role}</span>
                  <span className="text-xs text-[var(--muted)] uppercase">{m.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SubPage>
  );
}