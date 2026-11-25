"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { PlayerInventoryView } from "@/components/PlayerInventoryView";
import { useToast } from "@/components/Toast";
import type { DecodedPlayerData } from "@/lib/mc-playerdata";
import { minotarUrl } from "@/lib/minotar";

interface ServerPlayerRecord {
  uuid: string;
  name: string;
  online: boolean;
  isOp: boolean;
  opLevel: number | null;
  isBanned: boolean;
  banReason: string | null;
  hasPlayerdata: boolean;
  playerdataBytes: number | null;
  hasStats: boolean;
  hasAdvancements: boolean;
  expiresOn: string | null;
}

interface PlayerDetail {
  uuid: string;
  hasPlayerData: boolean;
  playerDataError?: string | null;
  playerData: DecodedPlayerData | null;
  hasStats: boolean;
  hasAdvancements: boolean;
  summary: {
    playTimeMinutes: number;
    deaths: number;
    mobKills: number;
    playerKills: number;
    damageDealt: number;
    damageTaken: number;
    jumps: number;
    distanceWalkedMeters: number;
    distanceSprintedMeters: number;
    distanceFlownMeters: number;
    timeSinceDeathMinutes: number;
    totalMined: number;
    totalCrafted: number;
    advancementsCompleted: number;
    advancementsTotal: number;
  };
  topMined: Array<{ id: string; label: string; count: number }>;
  topKilled: Array<{ id: string; label: string; count: number }>;
  recentAdvancements: Array<{ id: string; label: string; completedAt: string | null }>;
}

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters.toLocaleString("en-US")} m`;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function ServerPlayersTab({
  configured,
  serverOnline,
  onRunCommand,
}: {
  configured: boolean;
  serverOnline: boolean;
  onRunCommand: (cmd: string) => Promise<void>;
}) {
  const { show } = useToast();
  const [players, setPlayers] = useState<ServerPlayerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "ops" | "banned">("all");
  const [selected, setSelected] = useState<ServerPlayerRecord | null>(null);
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<"items" | "stats">("items");
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const loadRoster = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/server/players", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        players?: ServerPlayerRecord[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Couldn't load server player data.");
      setPlayers(data.players ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load server player data.");
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const inspectPlayer = useCallback(
    async (player: ServerPlayerRecord) => {
      setSelected(player);
      setDetail(null);
      setDetailLoading(true);
      try {
        const res = await fetch(
          `/api/admin/server/players?uuid=${encodeURIComponent(player.uuid)}`,
          { cache: "no-store" }
        );
        const data = (await res.json().catch(() => ({}))) as PlayerDetail & { error?: string };
        if (!res.ok) throw new Error(data.error || "Couldn't load player stats.");
        setDetail(data);
      } catch (err) {
        show("Stats unavailable", err instanceof Error ? err.message : "Try again.", "error");
      } finally {
        setDetailLoading(false);
      }
    },
    [show]
  );

  const quickCommand = async (label: string, cmd: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setActionBusy(label);
    try {
      await onRunCommand(cmd);
      await loadRoster();
    } finally {
      setActionBusy(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      if (filter === "online" && !p.online) return false;
      if (filter === "ops" && !p.isOp) return false;
      if (filter === "banned" && !p.isBanned) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.uuid.toLowerCase().includes(q);
    });
  }, [players, filter, query]);

  if (!configured) {
    return (
      <section className="admin-directory">
        <EmptyState
          className="admin-empty"
          icon="fa-plug-circle-xmark"
          title="Exaroton not connected"
          hint="Configure EXAROTON_TOKEN and EXAROTON_SERVER_ID to inspect live Minecraft player data."
        />
      </section>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <section className="admin-directory lg:col-span-5">
        <div className="admin-directory-head">
          <div>
            <h2>Server player data</h2>
            <p>
              Aggregated from <code>usercache.json</code>, <code>ops.json</code>,{" "}
              <code>world/playerdata</code>, and <code>world/stats</code>.
            </p>
          </div>
          <button
            type="button"
            className="admin-action-btn"
            onClick={() => void loadRoster()}
            disabled={loading}
          >
            <i className={`fa-solid fa-rotate ${loading ? "fa-spin" : ""}`} aria-hidden="true" /> Refresh
          </button>
        </div>

        <div className="admin-toolbar">
          <label className="admin-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <span className="sr-only">Search players</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${players.length} players or UUID…`}
            />
          </label>
          <div className="admin-filters" role="group" aria-label="Player filter">
            {(["all", "online", "ops", "banned"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                className={filter === f ? "is-active" : ""}
                onClick={() => setFilter(f)}
              >
                {f === "ops" ? "OPs" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="admin-loading" aria-label="Loading player data">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            className="admin-empty"
            icon="fa-triangle-exclamation"
            title="Couldn't load player data"
            hint={error}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            className="admin-empty"
            icon="fa-users"
            title={players.length === 0 ? "No player data on this world yet" : "No matching players"}
            hint={
              players.length === 0
                ? "Once players join the world, their stats, advancements, and playerdata appear here."
                : "Try clearing the search or filter."
            }
          />
        ) : (
          <div className="divide-y divide-[var(--border)] max-h-[560px] overflow-y-auto thin-scroll">
            {filtered.map((player) => {
              const active = selected?.uuid === player.uuid;
              return (
                <button
                  key={player.uuid}
                  type="button"
                  onClick={() => void inspectPlayer(player)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition hover:bg-[var(--card-hover)] ${
                    active ? "bg-[var(--accent-dim)]" : ""
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={minotarUrl(player.name, 36)}
                    alt=""
                    width={32}
                    height={32}
                    className="rounded-[6px] flex-none border border-[var(--border)]"
                    style={{ imageRendering: "pixelated" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-sm text-[var(--fg)] truncate">
                        {player.name}
                      </span>
                      {player.online ? <span className="admin-pill is-good">Online</span> : null}
                      {player.isOp ? (
                        <span className="admin-pill is-warn">OP L{player.opLevel ?? 4}</span>
                      ) : null}
                      {player.isBanned ? <span className="admin-pill is-bad">Banned</span> : null}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--muted-2)] truncate mt-0.5">
                      {player.uuid}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-[10px] text-[var(--muted)] flex-none">
                    {player.hasStats ? <span>Stats</span> : null}
                    {player.hasPlayerdata ? <span>{formatBytes(player.playerdataBytes)}</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="admin-directory lg:col-span-7">
        <div className="admin-directory-head">
          <div>
            <h2>{selected ? `${selected.name} — Player Inspector` : "Player items, stats & advancements"}</h2>
            <p>
              {selected
                ? `UUID: ${selected.uuid}`
                : "Select any player from the roster to inspect their Exaroton inventory, Ender Chest, armor, stats, and advancements."}
            </p>
          </div>
          {selected ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="admin-filters" role="tablist" aria-label="Player inspector view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailTab === "items"}
                  className={detailTab === "items" ? "is-active" : ""}
                  onClick={() => setDetailTab("items")}
                >
                  <i className="fa-solid fa-box-open" aria-hidden="true" /> Inventory &amp; Items
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailTab === "stats"}
                  className={detailTab === "stats" ? "is-active" : ""}
                  onClick={() => setDetailTab("stats")}
                >
                  <i className="fa-solid fa-chart-simple" aria-hidden="true" /> Stats &amp; Advancements
                </button>
              </div>
              <button
                type="button"
                className="admin-action-btn"
                onClick={() => {
                  void navigator.clipboard.writeText(selected.uuid);
                  show("UUID copied", selected.uuid);
                }}
              >
                <i className="fa-regular fa-copy" aria-hidden="true" /> UUID
              </button>
            </div>
          ) : null}
        </div>

        {!selected ? (
          <EmptyState
            className="admin-empty"
            icon="fa-user-astronaut"
            title="Select a player"
            hint="Inspect full Minecraft 1.21.11 inventories, armor, Ender Chest, shulker boxes, vitals, stats, and completed advancements directly from Exaroton."
          />
        ) : detailLoading ? (
          <div className="admin-loading" aria-label="Loading player data">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} />
            ))}
          </div>
        ) : (
          <div className="p-5 grid gap-5">
            {selected.isBanned && selected.banReason ? (
              <div className="rounded-[10px] border border-[var(--redstone)]/40 bg-[var(--bg-2)] px-4 py-2.5 text-xs text-[var(--fg-2)]">
                <strong className="text-[var(--redstone)]">Banned:</strong> {selected.banReason}
              </div>
            ) : null}

            {/* Quick admin actions when server is online */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="admin-action-btn"
                disabled={!serverOnline || actionBusy !== null}
                onClick={() =>
                  void quickCommand(
                    "op",
                    selected.isOp ? `deop ${selected.name}` : `op ${selected.name}`,
                    `${selected.isOp ? "Revoke operator from" : "Grant operator to"} ${selected.name}?`
                  )
                }
              >
                <i className="fa-solid fa-crown" aria-hidden="true" />{" "}
                {selected.isOp ? "Deop" : "Make OP"}
              </button>
              <button
                type="button"
                className="admin-action-btn"
                disabled={!serverOnline || !selected.online || actionBusy !== null}
                onClick={() =>
                  void quickCommand(
                    "kick",
                    `kick ${selected.name} Kicked by admin`,
                    `Kick ${selected.name} from the server?`
                  )
                }
              >
                <i className="fa-solid fa-right-from-bracket" aria-hidden="true" /> Kick
              </button>
              <button
                type="button"
                className="admin-action-btn is-danger"
                disabled={!serverOnline || actionBusy !== null}
                onClick={() =>
                  void quickCommand(
                    "ban",
                    selected.isBanned ? `pardon ${selected.name}` : `ban ${selected.name} Banned by admin`,
                    `${selected.isBanned ? "Pardon" : "Ban"} ${selected.name}?`
                  )
                }
              >
                <i className="fa-solid fa-gavel" aria-hidden="true" />{" "}
                {selected.isBanned ? "Pardon" : "Ban"}
              </button>
              {!serverOnline ? (
                <span className="text-[11px] text-[var(--muted)] ml-1">
                  Start the server to run live player commands.
                </span>
              ) : null}
            </div>

            {detailTab === "items" ? (
              detail?.playerData ? (
                <PlayerInventoryView
                  playerName={selected.name}
                  data={detail.playerData}
                  serverOnline={serverOnline}
                  onSaveAndRefresh={async () => {
                    if (serverOnline) {
                      await onRunCommand("save-all");
                      await new Promise((r) => setTimeout(r, 1400));
                    }
                    await inspectPlayer(selected);
                  }}
                />
              ) : (
                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] p-4 text-xs text-[var(--muted)]">
                  {detail?.playerDataError
                    ? detail.playerDataError
                    : `No world/playerdata/${selected.uuid}.dat file exists for this player yet.`}
                </div>
              )
            ) : (
              <>
                {detail?.hasStats ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {[
                        { label: "Play time", value: formatDuration(detail.summary.playTimeMinutes), icon: "fa-clock" },
                        { label: "Deaths", value: detail.summary.deaths.toLocaleString("en-US"), icon: "fa-skull" },
                        { label: "Mob kills", value: detail.summary.mobKills.toLocaleString("en-US"), icon: "fa-khanda" },
                        { label: "Player kills", value: detail.summary.playerKills.toLocaleString("en-US"), icon: "fa-crosshairs" },
                        { label: "Blocks mined", value: detail.summary.totalMined.toLocaleString("en-US"), icon: "fa-cubes" },
                        { label: "Items crafted", value: detail.summary.totalCrafted.toLocaleString("en-US"), icon: "fa-hammer" },
                        { label: "Walk + sprint", value: formatDistance(detail.summary.distanceWalkedMeters + detail.summary.distanceSprintedMeters), icon: "fa-person-running" },
                        { label: "Advancements", value: `${detail.summary.advancementsCompleted}/${detail.summary.advancementsTotal}`, icon: "fa-trophy" },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] p-3"
                        >
                          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
                            <i className={`fa-solid ${stat.icon} text-[var(--accent)]`} aria-hidden="true" />
                            {stat.label}
                          </div>
                          <div className="text-lg font-bold text-[var(--fg)] mt-1 tabular-nums">
                            {stat.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] p-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--fg-2)] mb-2.5">
                          Top mined blocks
                        </h3>
                        {detail.topMined.length === 0 ? (
                          <p className="text-xs text-[var(--muted)]">No blocks mined recorded.</p>
                        ) : (
                          <ul className="space-y-1.5 text-xs">
                            {detail.topMined.map((item) => (
                              <li key={item.id} className="flex justify-between gap-2">
                                <span className="text-[var(--fg-2)] truncate">{item.label}</span>
                                <span className="font-mono text-[var(--fg)] tabular-nums">
                                  {item.count.toLocaleString("en-US")}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] p-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--fg-2)] mb-2.5">
                          Top mobs killed
                        </h3>
                        {detail.topKilled.length === 0 ? (
                          <p className="text-xs text-[var(--muted)]">No mob kills recorded.</p>
                        ) : (
                          <ul className="space-y-1.5 text-xs">
                            {detail.topKilled.map((item) => (
                              <li key={item.id} className="flex justify-between gap-2">
                                <span className="text-[var(--fg-2)] truncate">{item.label}</span>
                                <span className="font-mono text-[var(--fg)] tabular-nums">
                                  {item.count.toLocaleString("en-US")}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] p-4 text-xs text-[var(--muted)]">
                    No <code>world/stats/{selected.uuid}.json</code> file exists for this player yet.
                  </div>
                )}

                {detail && detail.recentAdvancements.length > 0 ? (
                  <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] p-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--fg-2)] mb-2.5">
                      Recent advancements ({detail.summary.advancementsCompleted})
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.recentAdvancements.map((adv) => (
                        <span key={adv.id} className="admin-pill is-accent" title={adv.id}>
                          {adv.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
