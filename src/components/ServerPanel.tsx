"use client";

// Admin → Server Ops. Live Exaroton power controls (Start / Stop / Restart),
// RAM allocation, interactive console command runner + mclo.gs log sharing,
// and Whitelist / Operators / Banned Players management with 1-click member sync.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { isValidMcName } from "@/lib/mc-name";
import { minotarUrl } from "@/lib/minotar";
import { siteConfig } from "@/lib/site";
import type { ServerPlayerListName, ServerStatus, ServerTelemetry } from "@/types";

interface LinkedMember {
  id: string;
  username: string;
  minecraftUsername: string;
  discordVerified: boolean;
  avatarUrl?: string | null;
}

interface AdminServerResponse {
  configured?: boolean;
  list?: ServerPlayerListName;
  entries?: string[];
  listError?: string | null;
  telemetry?: ServerTelemetry;
  verifiedMembers?: LinkedMember[];
  error?: string;
}

const PLAYER_LIST_TABS: Array<{ id: ServerPlayerListName; label: string; icon: string }> = [
  { id: "whitelist", label: "Whitelist", icon: "fa-user-check" },
  { id: "ops", label: "Operators", icon: "fa-crown" },
  { id: "banned-players", label: "Banned Players", icon: "fa-gavel" },
];

const LOG_LEVELS = ["all", "info", "warning", "error", "chat"] as const;
type LogFilter = (typeof LOG_LEVELS)[number];

export function ServerPanel() {
  const { show } = useToast();
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmPower, setConfirmPower] = useState<"stop" | "restart" | null>(null);

  // Telemetry & console state
  const [telemetry, setTelemetry] = useState<ServerTelemetry | null>(null);
  const [ramDraft, setRamDraft] = useState<number>(4);
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  const [logSearch, setLogSearch] = useState("");
  const [command, setCommand] = useState("");
  const [sharedLogUrl, setSharedLogUrl] = useState<string | null>(null);

  // Player lists state
  const [activeList, setActiveList] = useState<ServerPlayerListName>("whitelist");
  const [entries, setEntries] = useState<string[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [verifiedMembers, setVerifiedMembers] = useState<LinkedMember[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [listQuery, setListQuery] = useState("");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consoleEndRef = useRef<HTMLDivElement | null>(null);
  // Latest selected tab, readable from async callbacks (the 3.5s follow-up
  // timer used to close over the list that was active when it was scheduled)
  // and the request sequence that stops a slower, older list response from
  // rendering its entries under the tab the admin is on now.
  const activeListRef = useRef<ServerPlayerListName>("whitelist");
  const listReqSeq = useRef(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const load = useCallback(async (listToFetch: ServerPlayerListName = activeListRef.current) => {
    // Only the newest request commits. A slow Whitelist fetch landing after
    // the admin clicked Operators used to paint whitelist names under the
    // Operators tab (so the row's ✕ removed the wrong list's player).
    const reqId = ++listReqSeq.current;
    setLoading(true);
    try {
      const [statusRes, controlRes, opsRes] = await Promise.all([
        fetch("/api/status", { cache: "no-store" }),
        fetch("/api/server/control", { cache: "no-store" }),
        fetch(`/api/admin/server?list=${encodeURIComponent(listToFetch)}`, { cache: "no-store" }),
      ]);
      const statusData = (await statusRes.json().catch(() => null)) as ServerStatus | null;
      const controlData = (await controlRes.json().catch(() => ({}))) as {
        configured?: boolean;
        allowed?: boolean;
      };
      const opsData = (await opsRes.json().catch(() => ({}))) as AdminServerResponse;

      // Superseded (newer tab / newer request) or no longer the active list:
      // drop the whole payload instead of overwriting the current tab's data.
      if (reqId !== listReqSeq.current || listToFetch !== activeListRef.current) return;

      if (statusData) setStatus(statusData);
      setConfigured(opsData.configured ?? controlData.configured ?? false);
      setAllowed(controlData.allowed ?? false);
      if (opsData.telemetry) {
        setTelemetry(opsData.telemetry);
        if (typeof opsData.telemetry.ramGb === "number") {
          setRamDraft(opsData.telemetry.ramGb);
        }
      }
      setEntries(opsData.entries ?? []);
      setListError(opsData.listError ?? null);
      if (opsData.verifiedMembers) setVerifiedMembers(opsData.verifiedMembers);
    } catch {
      /* retain previous snapshot */
    } finally {
      if (reqId === listReqSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    activeListRef.current = activeList;
    void load(activeList);
  }, [activeList, load]);

  const scheduleFollowupRefresh = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // load() defaults to the list selected when the timer FIRES — not the
      // one that was selected when the power action scheduled it.
      void load();
    }, 3500);
  };

  const serverState = status?.state ?? (status?.online ? "online" : "offline");
  const online = serverState === "online" || status?.online === true;
  const canStart = serverState === "offline" || serverState === "crashed";
  const canStopOrRestart = online;
  const transitional = ["starting", "stopping", "restarting", "loading", "pending"].includes(
    serverState
  );
  const stateLabel = status?.stateLabel ?? (online ? "Online" : "Offline");
  const playerCount = status?.players ?? 0;

  const runPower = async (action: "start" | "stop" | "restart") => {
    setBusyAction(action);
    try {
      const res = await fetch("/api/server/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "The server didn't respond.");
      setConfirmPower(null);
      show(
        action === "start" ? "Starting server" : action === "restart" ? "Restarting server" : "Stopping server",
        "Exaroton accepted the command — refreshing state shortly."
      );
      await load();
      scheduleFollowupRefresh();
    } catch (err) {
      show("Control failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const handlePowerClick = (action: "start" | "stop" | "restart") => {
    if ((action === "stop" || action === "restart") && playerCount > 0) {
      setConfirmPower(action);
      return;
    }
    void runPower(action);
  };

  const sendCommand = async () => {
    const trimmed = command.trim().replace(/^\/+/, "");
    if (!trimmed) return;
    setBusyAction("command");
    try {
      const res = await fetch("/api/admin/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "command", command: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't send command.");
      setCommand("");
      show("Command sent", `/${trimmed}`);
      scheduleFollowupRefresh();
    } catch (err) {
      show("Command failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const saveRam = async () => {
    setBusyAction("ram");
    try {
      const res = await fetch("/api/admin/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ram", ramGb: ramDraft }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't update RAM.");
      show("RAM updated", `Allocated ${ramDraft} GB to the server.`);
      await load();
    } catch (err) {
      show("RAM update failed", err instanceof Error ? err.message : "Server must be offline to resize RAM.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const shareLogs = async () => {
    setBusyAction("share_logs");
    try {
      const res = await fetch("/api/admin/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "share_logs" }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't upload log.");
      setSharedLogUrl(data.url);
      try {
        await navigator.clipboard.writeText(data.url);
        show("Log shared to mclo.gs", "Redacted log URL copied to your clipboard.");
      } catch {
        // The share itself succeeded and the URL renders in the bar above —
        // only the clipboard write failed (insecure origin, permission).
        // Claiming it was copied sent admins to paste stale clipboard text.
        show(
          "Log shared to mclo.gs",
          "Clipboard blocked — the URL is ready above to copy manually.",
          "error"
        );
      }
    } catch (err) {
      show("Share failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const filteredLines = useMemo(() => {
    const lines = telemetry?.lines ?? [];
    const q = logSearch.trim().toLowerCase();
    return lines.filter((line) => {
      if (logFilter !== "all" && line.level !== logFilter) return false;
      if (q && !line.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [telemetry, logFilter, logSearch]);

  const copyConsole = async () => {
    const text = filteredLines.map((l) => l.text).join("\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      show("Copied", `Copied ${filteredLines.length} log line(s).`);
    } catch {
      // No clipboard (plain HTTP/LAN, permission denied) — don't report a
      // copy that didn't happen; the admin would paste stale content.
      show("Couldn't copy", "Your browser blocked clipboard access.", "error");
    }
  };

  const addPlayer = async () => {
    const trimmed = newPlayerName.trim();
    if (!isValidMcName(trimmed)) {
      show("Invalid username", "Minecraft usernames are 3–16 letters, digits, or underscores.", "error");
      return;
    }
    setBusyAction("list_add");
    try {
      const res = await fetch("/api/admin/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "playerlist_add",
          list: activeList,
          username: trimmed,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { entries?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't add player.");
      if (data.entries) setEntries(data.entries);
      setNewPlayerName("");
      show("Added", `${trimmed} added to ${activeList}.`);
    } catch (err) {
      show("Add failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const removePlayer = async (username: string) => {
    setBusyAction(`rm:${username}`);
    try {
      const res = await fetch("/api/admin/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "playerlist_remove",
          list: activeList,
          username,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { entries?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't remove player.");
      if (data.entries) setEntries(data.entries);
      show("Removed", `${username} removed from ${activeList}.`);
    } catch (err) {
      show("Remove failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const syncWhitelist = async () => {
    setBusyAction("sync_whitelist");
    try {
      const res = await fetch("/api/admin/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_whitelist", onlyVerified: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        added?: string[];
        entries?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Couldn't sync whitelist.");
      if (data.entries && activeList === "whitelist") setEntries(data.entries);
      const count = data.added?.length ?? 0;
      show(
        count > 0 ? "Whitelist synced" : "Already in sync",
        count > 0 ? `Added ${count} verified member(s) to the server whitelist.` : "Every verified member with a linked MC name is already whitelisted."
      );
    } catch (err) {
      show("Sync failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const missingFromWhitelist = useMemo(() => {
    if (activeList !== "whitelist") return [];
    const lowerSet = new Set(entries.map((e) => e.toLowerCase()));
    return verifiedMembers.filter(
      (m) => m.discordVerified && m.minecraftUsername && !lowerSet.has(m.minecraftUsername.toLowerCase())
    );
  }, [activeList, entries, verifiedMembers]);

  const filteredEntries = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    return q ? entries.filter((e) => e.toLowerCase().includes(q)) : entries;
  }, [entries, listQuery]);

  return (
    <div className="grid gap-4">
      {/* Power & Memory Control Deck */}
      <section className="admin-directory">
        <div className="admin-directory-head">
          <div className="flex items-center gap-3">
            <span
              className={`h-2.5 w-2.5 rounded-full flex-none ${
                online
                  ? "bg-[var(--emerald)]"
                  : transitional
                    ? "bg-[#ffd166]"
                    : serverState === "crashed"
                      ? "bg-[var(--redstone)]"
                      : "bg-[var(--muted-2)]"
              }`}
              aria-hidden="true"
            />
            <div>
              <h2>
                {loading && !status ? "Checking server…" : stateLabel}
                {status?.serverName ? ` · ${status.serverName}` : ""}
              </h2>
              <p>
                {siteConfig.address} · {status?.software ?? siteConfig.software}{" "}
                {status?.version ?? siteConfig.version}
                {online ? ` · ${playerCount}/${status?.max ?? siteConfig.maxPlayers} online` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!siteConfig.seasonLive ? (
              <span className="admin-pill is-warn">
                <i className="fa-solid fa-flask" aria-hidden="true" /> Pre-launch admin access
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="admin-action-btn"
            >
              <i className={`fa-solid fa-rotate ${loading ? "fa-spin" : ""}`} aria-hidden="true" /> Refresh
            </button>
          </div>
        </div>

        <div className="p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => handlePowerClick("start")}
              disabled={!configured || !allowed || busyAction !== null || !canStart}
              className="btn-primary btn-sm disabled:opacity-40"
            >
              <i className="fa-solid fa-play" aria-hidden="true" />
              {busyAction === "start" ? "Starting…" : "Start"}
            </button>
            <button
              type="button"
              onClick={() => handlePowerClick("restart")}
              disabled={!configured || !allowed || busyAction !== null || !canStopOrRestart}
              className="btn-secondary btn-sm disabled:opacity-40"
            >
              <i className="fa-solid fa-rotate-right" aria-hidden="true" />
              {busyAction === "restart" ? "Restarting…" : "Restart"}
            </button>
            <button
              type="button"
              onClick={() => handlePowerClick("stop")}
              disabled={!configured || !allowed || busyAction !== null || !canStopOrRestart}
              className="btn-secondary btn-sm disabled:opacity-40"
            >
              <i className="fa-solid fa-stop" aria-hidden="true" />
              {busyAction === "stop" ? "Stopping…" : "Stop"}
            </button>
          </div>

          {configured ? (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="admin-ram-select" className="text-xs text-[var(--muted)] font-semibold">
                Memory (GiB):
              </label>
              <select
                id="admin-ram-select"
                value={ramDraft}
                onChange={(e) => setRamDraft(Number(e.target.value))}
                disabled={!canStart || busyAction !== null}
                className="admin-role-select !w-24"
                title={canStart ? "Select server RAM" : "Stop the server before changing RAM"}
              >
                {[2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16].map((gb) => (
                  <option key={gb} value={gb}>
                    {gb} GB
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="admin-action-btn"
                disabled={
                  !canStart ||
                  busyAction !== null ||
                  telemetry?.ramGb === null ||
                  ramDraft === telemetry?.ramGb
                }
                onClick={() => void saveRam()}
              >
                {busyAction === "ram" ? "Saving…" : "Apply RAM"}
              </button>
            </div>
          ) : null}
        </div>

        {!loading && configured === false ? (
          <div className="px-5 pb-4 text-xs text-[#ffd166]">
            <i className="fa-solid fa-triangle-exclamation mr-1.5" aria-hidden="true" />
            Hosting API not configured — set EXAROTON_TOKEN and EXAROTON_SERVER_ID in environment variables.
          </div>
        ) : !loading && allowed === false ? (
          <div className="px-5 pb-4 text-xs text-[#ffd166]">
            Control is locked until {siteConfig.season} launches for non-admins.
          </div>
        ) : null}

        {online && (status?.playerList?.length ?? 0) > 0 ? (
          <div className="px-5 pb-4 pt-2 border-t border-[var(--border)] flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--muted)] font-semibold mr-1">Connected now:</span>
            {status!.playerList!.map((name) => (
              <span key={name} className="admin-pill is-good">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={minotarUrl(name, 20)}
                  alt=""
                  width={14}
                  height={14}
                  className="rounded-[3px]"
                  style={{ imageRendering: "pixelated" }}
                />
                {name}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      {/* Interactive Console & Log Share */}
      <section className="admin-directory">
        <div className="admin-directory-head">
          <div>
            <h2>Live server console</h2>
            <p>Tail sanitized server logs (player IPs redacted), share crash reports via mclo.gs, or run console commands.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="admin-action-btn"
              onClick={() => void copyConsole()}
              disabled={filteredLines.length === 0}
            >
              <i className="fa-solid fa-copy" aria-hidden="true" /> Copy
            </button>
            <button
              type="button"
              className="admin-action-btn"
              onClick={() => void shareLogs()}
              disabled={!configured || busyAction === "share_logs"}
            >
              <i className="fa-solid fa-share-nodes" aria-hidden="true" />{" "}
              {busyAction === "share_logs" ? "Uploading…" : "Share to mclo.gs"}
            </button>
          </div>
        </div>

        {sharedLogUrl ? (
          <div className="px-5 py-2.5 bg-[var(--bg-2)] border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[var(--fg-2)]">
              Shared redacted log:{" "}
              <a
                href={sharedLogUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-[var(--accent-bright)]"
              >
                {sharedLogUrl}
              </a>
            </span>
            <button
              type="button"
              onClick={() => setSharedLogUrl(null)}
              className="text-[var(--muted)] hover:text-[var(--fg)]"
              aria-label="Dismiss shared log URL"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <div className="admin-toolbar">
          <label className="admin-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <span className="sr-only">Filter console output</span>
            <input
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              placeholder="Search console lines…"
            />
            {logSearch ? (
              <button type="button" onClick={() => setLogSearch("")} aria-label="Clear console search">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <div className="admin-filters" role="group" aria-label="Log level">
            {LOG_LEVELS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                aria-pressed={logFilter === lvl}
                onClick={() => setLogFilter(lvl)}
                className={logFilter === lvl ? "is-active" : ""}
              >
                {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="admin-console-log thin-scroll" role="log" aria-live="off">
          {filteredLines.length === 0 ? (
            <div className="text-[var(--muted)] py-8 text-center text-xs font-sans">
              {!configured
                ? "Configure Exaroton credentials to stream server logs."
                : (telemetry?.lines.length ?? 0) === 0
                  ? "No console output available right now."
                  : "No log lines match the active filter."}
            </div>
          ) : (
            filteredLines.map((line) => (
              <div key={line.id} className={`admin-console-line is-${line.level}`}>
                {line.text}
              </div>
            ))
          )}
          <div ref={consoleEndRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendCommand();
          }}
          className="p-3.5 bg-[var(--bg-2)] border-t border-[var(--border)] flex items-center gap-2"
        >
          <span className="text-xs font-mono text-[var(--muted)] pl-1.5 select-none" aria-hidden="true">
            &gt;
          </span>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            disabled={!online || busyAction === "command"}
            maxLength={240}
            aria-label="Minecraft console command"
            placeholder={
              online
                ? "Run server command (e.g. say Server restarting in 5m, whitelist list, time set day)…"
                : "Start the server to send live console commands"
            }
            className="input !py-2 font-mono text-xs flex-1"
          />
          <button
            type="submit"
            disabled={!online || !command.trim() || busyAction === "command"}
            className="btn-primary btn-sm"
          >
            <i className="fa-solid fa-paper-plane" aria-hidden="true" />
            {busyAction === "command" ? "Sending…" : "Send"}
          </button>
        </form>
      </section>

      {/* Player Lists & 1-Click Whitelist Sync */}
      <section className="admin-directory">
        <div className="admin-directory-head">
          <div>
            <h2>Player access lists</h2>
            <p>Manage Exaroton&apos;s live Whitelist, Server Operators (ops), and Banned Players directly.</p>
          </div>
          <div className="admin-directory-tabs" role="tablist" aria-label="Player list type">
            {PLAYER_LIST_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeList === tab.id}
                className={activeList === tab.id ? "is-active" : ""}
                onClick={() => setActiveList(tab.id)}
              >
                <i className={`fa-solid ${tab.icon}`} aria-hidden="true" /> {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeList === "whitelist" && configured && missingFromWhitelist.length > 0 ? (
          <div className="px-5 py-3 bg-[var(--accent-dim)] border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[var(--fg-2)]">
              <strong className="text-[var(--fg)]">
                {missingFromWhitelist.length} verified member{missingFromWhitelist.length === 1 ? "" : "s"}
              </strong>{" "}
              with linked Minecraft accounts {missingFromWhitelist.length === 1 ? "is" : "are"} not on the whitelist yet (
              {missingFromWhitelist
                .slice(0, 5)
                .map((m) => m.minecraftUsername)
                .join(", ")}
              {missingFromWhitelist.length > 5 ? "…" : ""}).
            </div>
            <button
              type="button"
              onClick={() => void syncWhitelist()}
              disabled={busyAction !== null}
              className="btn-primary btn-sm"
            >
              <i className="fa-solid fa-arrows-rotate" aria-hidden="true" />
              {busyAction === "sync_whitelist" ? "Syncing…" : "Sync Verified Members"}
            </button>
          </div>
        ) : null}

        <div className="admin-toolbar">
          <label className="admin-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <span className="sr-only">Search {activeList}</span>
            <input
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder={`Filter ${activeList} (${entries.length})…`}
            />
            {listQuery ? (
              <button type="button" onClick={() => setListQuery("")} aria-label="Clear filter">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : null}
          </label>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addPlayer();
            }}
            className="flex items-center gap-2 w-full sm:w-auto"
          >
            <input
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              maxLength={16}
              disabled={!configured || busyAction === "list_add"}
              aria-label={`Add player to ${activeList}`}
              placeholder="Minecraft username…"
              className="input !py-1.5 !px-3 text-xs sm:!w-52"
            />
            <button
              type="submit"
              disabled={!configured || !newPlayerName.trim() || busyAction === "list_add"}
              className="admin-action-btn"
            >
              <i className="fa-solid fa-plus" aria-hidden="true" /> Add
            </button>
            {activeList === "whitelist" ? (
              <button
                type="button"
                onClick={() => void syncWhitelist()}
                disabled={!configured || busyAction !== null}
                className="admin-action-btn"
                title="Ensure all Discord-verified members with linked MC names are whitelisted"
              >
                <i className="fa-solid fa-arrows-rotate" aria-hidden="true" /> Sync
              </button>
            ) : null}
          </form>
        </div>

        {!configured ? (
          <EmptyState
            className="admin-empty"
            icon="fa-plug-circle-xmark"
            title="Exaroton not connected"
            hint="Set EXAROTON_TOKEN and EXAROTON_SERVER_ID to manage live player lists."
          />
        ) : listError ? (
          <EmptyState
            className="admin-empty"
            icon="fa-triangle-exclamation"
            title="Player list unavailable"
            hint={listError}
          />
        ) : filteredEntries.length === 0 ? (
          <EmptyState
            className="admin-empty"
            icon="fa-users"
            title={entries.length === 0 ? `No entries in ${activeList}` : "No players match filter"}
            hint={
              entries.length === 0
                ? "Add a Minecraft username above or sync verified community members."
                : "Clear the search filter to view all entries."
            }
          />
        ) : (
          <div className="p-5 grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filteredEntries.map((player) => (
              <div
                key={player}
                className="flex items-center justify-between gap-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={minotarUrl(player, 32)}
                    alt=""
                    width={24}
                    height={24}
                    className="rounded-[6px] flex-none"
                    style={{ imageRendering: "pixelated" }}
                  />
                  <span className="truncate text-xs font-semibold text-[var(--fg)]">{player}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void removePlayer(player)}
                  disabled={busyAction === `rm:${player}`}
                  aria-label={`Remove ${player} from ${activeList}`}
                  className="admin-icon-button !w-7 !h-7"
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {confirmPower ? (
        <Modal
          label={`Confirm server ${confirmPower}`}
          onClose={() => {
            if (!busyAction) setConfirmPower(null);
          }}
          cardClassName="admin-confirm-modal"
        >
          <div className="admin-confirm-icon">
            <i
              className={`fa-solid ${confirmPower === "stop" ? "fa-stop" : "fa-rotate-right"}`}
              aria-hidden="true"
            />
          </div>
          <div>
            <span className="admin-confirm-kicker">Players connected</span>
            <h2>
              {confirmPower === "stop" ? "Stop" : "Restart"} the server while {playerCount} player
              {playerCount === 1 ? " is" : "s are"} online?
            </h2>
            <p>
              Connected players will be disconnected immediately. Consider sending an in-game announcement from the console first.
            </p>
          </div>
          <div className="admin-confirm-actions">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setConfirmPower(null)}
              disabled={busyAction !== null}
            >
              Cancel
            </button>
            <button
              type="button"
              className="admin-confirm-remove"
              onClick={() => void runPower(confirmPower)}
              disabled={busyAction !== null}
            >
              <i
                className={`fa-solid ${confirmPower === "stop" ? "fa-stop" : "fa-rotate-right"}`}
                aria-hidden="true"
              />{" "}
              {confirmPower === "stop" ? "Stop server" : "Restart server"}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
