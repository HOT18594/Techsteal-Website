"use client";

import { useApi } from "@/lib/use-api";
import type { Member } from "@/types";
import { Reveal } from "./Reveal";

export function Members() {
  const { data: members, loading } = useApi<Member[]>("/api/members", []);

  const online = members.filter((m) => m.status === "online").length;
  const offline = members.length - online;

  return (
    <section id="members" className="relative py-24 lg:py-32 z-10">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <Reveal>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-16">
            <div>
              <div className="section-label mb-4">05 / Members</div>
              <h2 className="font-display text-5xl md:text-6xl font-bold mb-3">Members</h2>
            </div>
            <div className="mt-6 md:mt-0 flex items-center gap-4 text-sm text-[var(--muted)]">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-[var(--emerald)]" />
                {online} online
              </span>
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-[var(--muted-2)]" />
                {offline} offline
              </span>
            </div>
          </div>
        </Reveal>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No members listed yet.</p>
          ) : (
            members.map((m) => (
              <div key={m.id ?? m.name} className="member-card">
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

                <div className="mb-3">
                  <div className="font-display text-xl font-bold">{m.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <i className={`fa-solid ${m.icon} text-[var(--accent)] text-xs`} />
                    <span className="text-sm text-[var(--accent)]">{m.role}</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-[var(--border)] flex justify-between items-center">
                  <div>
                    <div className="text-xs text-[var(--muted)] uppercase tracking-wider">Playtime</div>
                    <div className="font-display text-sm">{m.playtime}</div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span
                      className={`w-1.5 h-1.5 ${
                        m.status === "online" ? "bg-[var(--emerald)]" : "bg-[var(--muted-2)]"
                      } rounded-full`}
                    />
                    <span
                      className={`${
                        m.status === "online" ? "text-[var(--emerald)]" : "text-[var(--muted)]"
                      } uppercase tracking-wider`}
                    >
                      {m.status}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
