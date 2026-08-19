"use client";

import { fallbackMembers } from "@/lib/fallback-data";
import type { Member } from "@/types";
import { Avatar } from "@/components/Avatar";
import { SubPage } from "@/components/SubPage";
import { useApi } from "@/lib/use-api";

export default function MembersPage() {
  const { data: members } = useApi<Member[]>("/api/members", fallbackMembers);

  const online = members.filter((m) => m.status === "online").length;
  const offline = members.length - online;

  return (
    <SubPage>
      <div className="w-full">
        {/* Header */}
        <div className="page-header rowed mb-8">
          <h1 className="page-title">Members</h1>
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
          /* Console-style member cards */
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger">
            {members.map((m) => (
              <div key={m.id ?? m.name} className="member-card flex items-start gap-4">
                <Avatar
                  name={m.name}
                  src={m.avatarUrl}
                  size="md"
                  color={m.color}
                  online={m.status === "online"}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display text-lg font-bold break-words">{m.name}</h3>
                    <span className={`tag ${m.status === "online" ? "tag-emerald" : ""}`}>
                      {m.role}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Joined <span className="text-[var(--fg-2)]">{m.joined}</span>
                    {m.verified ? (
                      <>
                        {" "}· <span className="text-[var(--diamond)]">Discord-verified</span>
                      </>
                    ) : null}
                  </p>
                  <div
                    className={`mt-3 flex items-center gap-2 text-xs uppercase tracking-wider ${
                      m.status === "online" ? "text-[var(--emerald)]" : "text-[var(--muted-2)]"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        m.status === "online"
                          ? "bg-[var(--emerald)] shadow-[0_0_8px_var(--emerald-glow)]"
                          : "bg-[var(--muted-2)]"
                      }`}
                    />
                    {m.status === "online" ? "In-game right now" : "Offline"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SubPage>
  );
}
