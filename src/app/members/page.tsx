"use client";

import { fallbackMembers } from "@/lib/fallback-data";
import type { Member } from "@/types";
import { SubPage } from "@/components/SubPage";
import { useApi } from "@/lib/use-api";
import { Carousel } from "@/components/Carousel";

export default function MembersPage() {
  const { data: members } = useApi<Member[]>("/api/members", fallbackMembers);

  const online = members.filter((m) => m.status === "online").length;
  const offline = members.length - online;

  const slides = members.map((m) => (
    <div key={m.id ?? m.name} className="card member-slide">
      {/* Glow backdrop tinted with the member's accent */}
      <div className="member-slide-glow" aria-hidden="true" />
      <div className="relative">
        <div className={`avatar avatar-xl ${m.color} member-slide-avatar`}>{m.avatar}</div>
        <div className={m.status === "online" ? "status-online" : "status-offline"} />
      </div>
      <h2 className="mt-6 font-display text-3xl font-bold">{m.name}</h2>
      <span className="tag tag-accent mt-2">{m.role}</span>
      <p className="mt-4 text-sm text-[var(--muted)]">
        Joined <span className="text-[var(--fg-2)]">{m.joined}</span> ·{" "}
        <span className="text-[var(--fg-2)]">{m.playtime}</span> playtime
      </p>
      <div className={`mt-5 flex items-center gap-2 text-xs uppercase tracking-wider ${m.status === "online" ? "text-[var(--emerald)]" : "text-[var(--muted-2)]"}`}>
        <span className={`w-2 h-2 rounded-full ${m.status === "online" ? "bg-[var(--emerald)] shadow-[0_0_8px_var(--emerald-glow)]" : "bg-[var(--muted-2)]"}`} />
        {m.status === "online" ? "In-game right now" : "Offline"}
      </div>
    </div>
  ));

  return (
    <SubPage className="mx-auto max-w-7xl pt-6 pb-16">
      <div className="max-w-7xl mx-auto w-full">
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
          <Carousel slides={slides} label="Members" interval={6500} />
        )}
      </div>
    </SubPage>
  );
}
