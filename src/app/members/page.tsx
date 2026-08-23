"use client";

import { useMemo, useState } from "react";
import { fallbackMembers } from "@/lib/fallback-data";
import type { Member } from "@/types";
import { Avatar } from "@/components/Avatar";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { SubPage } from "@/components/SubPage";
import { useApi } from "@/lib/use-api";

type Filter = "all" | "online" | "admin" | "member";

export default function MembersPage() {
  const { data: members, loading, error, refetch } = useApi<Member[]>("/api/members", fallbackMembers);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const online = members.filter((m) => m.status === "online").length;

  const visible = useMemo(() => {
    let list = members;
    if (filter === "online") list = list.filter((m) => m.status === "online");
    if (filter === "admin") list = list.filter((m) => m.role === "Admin");
    if (filter === "member") list = list.filter((m) => m.role !== "Admin");
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.minecraftUsername ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [members, filter, search]);

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: members.length },
    { key: "online", label: "Online", count: online },
    { key: "admin", label: "Admins", count: members.filter((m) => m.role === "Admin").length },
    { key: "member", label: "Members", count: members.filter((m) => m.role !== "Admin").length },
  ];

  return (
    <SubPage>
      <div className="w-full">
        {/* Header */}
        <div className="page-header rowed mb-6 gap-4">
          <div>
            <p className="page-kicker">
              <i className="fa-solid fa-users" aria-hidden="true" />
              The in-game roster
            </p>
            <h1 className="page-title">Members</h1>
          </div>
          <div className="relative w-full max-w-xs min-w-[10rem]">
            <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-2)]" />
            <input
              className="input pl-9! pr-8! py-2.5!"
              placeholder="Search name or MC username…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search members"
            />
            {search ? (
              <button
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-2)] hover:text-[var(--fg)] transition"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Filter chips with counts + online counter */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-8">
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition ${
                  filter === f.key
                    ? "bg-[var(--accent-dim)] border-[var(--accent)] text-[var(--accent)] shadow-[0_0_16px_-8px_var(--accent-glow)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--border-strong)]"
                }`}
              >
                {f.key === "online" ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--emerald)] shadow-[0_0_6px_var(--emerald-glow)]" />
                ) : null}
                {f.label}
                <span className="text-xs opacity-70">{f.count}</span>
              </button>
            ))}
          </div>
          <span className="text-xs text-[var(--muted-2)]">
            {online} of {members.length} in-game
          </span>
        </div>

        {error && members.length === 0 ? (
          <ErrorState onRetry={() => void refetch()} what="member list" />
        ) : loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="member-card flex items-start gap-4 animate-pulse">
                <div className="w-12 h-12 rounded-[10px] bg-white/5" />
                <div className="flex-1">
                  <div className="h-4 w-24 bg-white/5 rounded mb-2" />
                  <div className="h-3 w-32 bg-white/5 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon="fa-users"
            title={
              members.length === 0
                ? "No Minecraft-linked members yet"
                : search.trim() || filter !== "all"
                  ? "No members match"
                  : "No members yet"
            }
            hint={
              members.length === 0
                ? "Members appear here once they link a Minecraft username in Settings."
                : undefined
            }
            action={
              search.trim() || filter !== "all" ? (
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
          /* Console-style member cards */
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger">
            {visible.map((m) => (
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
                    <span className={`tag ${m.status === "online" ? "tag-emerald" : ""}`}>{m.role}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {m.minecraftUsername ? (
                      <>
                        MC · <span className="text-[var(--fg-2)]">{m.minecraftUsername}</span>
                      </>
                    ) : null}
                    {m.joined ? (
                      <>
                        {m.minecraftUsername ? " · " : ""}Joined <span className="text-[var(--fg-2)]">{m.joined}</span>
                      </>
                    ) : null}
                    {m.verified ? (
                      <>
                        {" "}· <span className="text-[var(--diamond)]">verified</span>
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
