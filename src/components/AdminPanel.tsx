"use client";

import "./admin.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminOverview, type AdminSectionId } from "@/components/AdminOverview";
import { AuditLog } from "@/components/AuditLog";
import { Avatar } from "@/components/Avatar";
import { ContentCmsPanel } from "@/components/ContentCmsPanel";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { ModerationPanel } from "@/components/ModerationPanel";
import { ServerPanel } from "@/components/ServerPanel";
import { SubPage } from "@/components/SubPage";
import { useToast } from "@/components/Toast";
import { isValidMcName } from "@/lib/mc-name";
import { minotarUrl } from "@/lib/minotar";
import type { Account, Permission, SessionUser } from "@/types";

const PERMISSIONS: Array<{
  id: Permission;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
}> = [
  {
    id: "server_control",
    label: "Server control",
    shortLabel: "Server",
    description: "Start and stop the Minecraft server",
    icon: "fa-server",
  },
  {
    id: "ai_access",
    label: "AI assistant",
    shortLabel: "AI",
    description: "Use Chatty Jr. and its server tools",
    icon: "fa-wand-magic-sparkles",
  },
  {
    id: "gallery_post",
    label: "Gallery posting",
    shortLabel: "Gallery",
    description: "Publish builds to the gallery",
    icon: "fa-images",
  },
];

const SECTIONS: Array<{
  id: AdminSectionId;
  label: string;
  title: string;
  subtitle: string;
  icon: string;
}> = [
  {
    id: "overview",
    label: "Overview",
    title: "Command center",
    subtitle: "Live server readiness, community metrics, and quick administrative actions.",
    icon: "fa-gauge-high",
  },
  {
    id: "members",
    label: "Members",
    title: "Member access",
    subtitle: "Manage roles, capabilities, Minecraft usernames, Discord verification, and account access.",
    icon: "fa-users",
  },
  {
    id: "server",
    label: "Server Ops",
    title: "Server operations",
    subtitle: "Power controls, RAM allocation, live console commands, and player whitelists.",
    icon: "fa-server",
  },
  {
    id: "content",
    label: "Site Content",
    title: "Site content",
    subtitle: "Publish announcements and edit server rules and season history live in the database.",
    icon: "fa-pen-ruler",
  },
  {
    id: "moderation",
    label: "Moderation",
    title: "Moderation & storage",
    subtitle: "Review forum threads, polls, replies, gallery builds, and clean orphaned storage files.",
    icon: "fa-shield-cat",
  },
  {
    id: "audit",
    label: "Audit Log",
    title: "Audit log",
    subtitle: "Searchable, exportable record of every privileged action taken on the server.",
    icon: "fa-clipboard-list",
  },
];

type AdminPatch = {
  role?: Account["role"];
  grant?: Permission[];
  revoke?: Permission[];
  minecraftUsername?: string | null;
  onboarded?: boolean;
  discordVerified?: boolean;
};

type DirectoryView = "members" | "removed";
type MemberFilter = "all" | "admins" | "verified" | "mc_linked" | "needs_setup";

function matchesSearch(account: Account, query: string): boolean {
  if (!query) return true;
  return [account.username, account.minecraftUsername, account.email, account.id]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(query));
}

function MemberIdentity({ account, isSelf = false }: { account: Account; isSelf?: boolean }) {
  return (
    <div className="admin-member-identity">
      <Avatar name={account.username} src={account.avatarUrl ?? null} size="sm" className="admin-member-avatar" />
      <div className="min-w-0">
        <div className="admin-member-name">
          <span className="truncate">{account.username}</span>
          {isSelf ? <span className="admin-you-badge">You</span> : null}
        </div>
        <div className="admin-member-meta">
          {account.minecraftUsername ? `MC · ${account.minecraftUsername}` : "Minecraft not linked"}
        </div>
      </div>
    </div>
  );
}

function AccountStatus({ account }: { account: Account }) {
  return (
    <div className="admin-status-list">
      <span className={`admin-status ${account.discordVerified ? "is-good" : "is-warning"}`}>
        <i
          className={`fa-solid ${account.discordVerified ? "fa-circle-check" : "fa-circle-minus"}`}
          aria-hidden="true"
        />
        {account.discordVerified ? "Discord verified" : "Not verified"}
      </span>
      <span className={`admin-status ${account.onboarded ? "is-neutral" : "is-warning"}`}>
        <i className={`fa-solid ${account.onboarded ? "fa-check" : "fa-clock"}`} aria-hidden="true" />
        {account.onboarded ? "Setup complete" : "Setup pending"}
      </span>
    </div>
  );
}

export function AdminPanel({
  currentUser,
  initialTab = "overview",
}: {
  currentUser: SessionUser;
  initialTab?: AdminSectionId;
}) {
  const { show } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [banned, setBanned] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [panel, setPanel] = useState<AdminSectionId>(initialTab);
  const [view, setView] = useState<DirectoryView>("members");
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [query, setQuery] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<Account | null>(null);

  // Member edit drawer/modal
  const [editingMember, setEditingMember] = useState<Account | null>(null);
  const [mcDraft, setMcDraft] = useState("");
  const [onboardedDraft, setOnboardedDraft] = useState(false);
  const [verifiedDraft, setVerifiedDraft] = useState(false);
  const [modalBusy, setModalBusy] = useState<string | null>(null);

  const reqSeq = useRef(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const load = useCallback(
    async (initial = false) => {
      const reqId = ++reqSeq.current;
      if (initial) setLoading(true);
      else setRefreshing(true);
      setLoadError(null);
      try {
        const res = await fetch("/api/admin/members", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          accounts?: Account[];
          bannedAccounts?: Account[];
          error?: string;
        };
        if (reqId !== reqSeq.current) return;
        if (!res.ok) throw new Error(data.error || "Are you signed in as an admin?");
        setAccounts(data.accounts ?? []);
        setBanned(data.bannedAccounts ?? []);
      } catch (err) {
        if (reqId !== reqSeq.current) return;
        const message = err instanceof Error ? err.message : "Are you signed in as an admin?";
        setLoadError(message);
        show("Failed to load members", message, "error");
      } finally {
        if (reqId === reqSeq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [show]
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  const save = async (id: string, patch: AdminPatch, toastTitle = "Access updated") => {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = (await res.json().catch(() => ({}))) as { account?: Account; error?: string };
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      await load();
      show(toastTitle, "Changes saved to the member database.");
      return data.account ?? null;
    } catch (err) {
      show("Couldn't save", err instanceof Error ? err.message : "Something went wrong.", "error");
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const togglePermission = (account: Account, permission: Permission) => {
    const has = account.permissions.includes(permission);
    void save(account.id, has ? { revoke: [permission] } : { grant: [permission] });
  };

  const remove = async (account: Account) => {
    setBusyId(account.id);
    try {
      const res = await fetch("/api/admin/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setConfirmRemove(null);
      await load();
      show("Member removed", `${account.username} can no longer sign in.`);
    } catch (err) {
      show("Couldn't remove", err instanceof Error ? err.message : "Something went wrong.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const restore = async (account: Account) => {
    setBusyId(account.id);
    try {
      const res = await fetch("/api/admin/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      await load();
      show("Member restored", `${account.username} can sign in again.`);
    } catch (err) {
      show("Couldn't restore", err instanceof Error ? err.message : "Something went wrong.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const openMemberModal = (account: Account) => {
    setEditingMember(account);
    setMcDraft(account.minecraftUsername ?? "");
    setOnboardedDraft(Boolean(account.onboarded));
    setVerifiedDraft(Boolean(account.discordVerified));
  };

  const saveMemberProfile = async () => {
    if (!editingMember) return;
    const trimmedMc = mcDraft.trim();
    if (trimmedMc && !isValidMcName(trimmedMc)) {
      show("Invalid Minecraft name", "Use 3–16 letters, numbers, or underscores (or leave blank to clear).", "error");
      return;
    }
    setModalBusy("save");
    const patch: AdminPatch = {};
    if ((editingMember.minecraftUsername ?? "") !== trimmedMc) {
      patch.minecraftUsername = trimmedMc || null;
    }
    if (Boolean(editingMember.onboarded) !== onboardedDraft) {
      patch.onboarded = onboardedDraft;
    }
    if (Boolean(editingMember.discordVerified) !== verifiedDraft) {
      patch.discordVerified = verifiedDraft;
    }
    if (Object.keys(patch).length === 0) {
      setModalBusy(null);
      setEditingMember(null);
      return;
    }
    const updated = await save(editingMember.id, patch, "Member updated");
    setModalBusy(null);
    if (updated) setEditingMember(null);
  };

  const recheckDiscordGuild = async () => {
    if (!editingMember) return;
    setModalBusy("reverify");
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingMember.id, reverifyDiscord: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        account?: Account;
        discordVerified?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Couldn't query Discord.");
      if (data.account) {
        setEditingMember(data.account);
        setVerifiedDraft(Boolean(data.account.discordVerified));
      }
      await load();
      show(
        data.discordVerified ? "Verified in Discord" : "Not in Discord server",
        data.discordVerified
          ? `${editingMember.username} is in the guild — perks synced.`
          : `${editingMember.username} is not in the guild — verification cleared.`
      );
    } catch (err) {
      show("Discord check failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setModalBusy(null);
    }
  };

  const quickWhitelistMember = async (mcName: string) => {
    setModalBusy("whitelist");
    try {
      const res = await fetch("/api/admin/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "playerlist_add",
          list: "whitelist",
          username: mcName,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't add to whitelist.");
      show("Whitelisted", `${mcName} added to the Exaroton server whitelist.`);
    } catch (err) {
      show("Whitelist failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setModalBusy(null);
    }
  };

  const exportMembersCsv = () => {
    const list = view === "members" ? visibleAccounts : visibleBanned;
    if (list.length === 0) return;
    const esc = (v?: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const header = ["id", "username", "minecraft_username", "role", "discord_verified", "onboarded", "permissions", "created_at"].join(",");
    const rows = list.map((a) =>
      [
        esc(a.id),
        esc(a.username),
        esc(a.minecraftUsername),
        esc(a.role),
        String(Boolean(a.discordVerified)),
        String(Boolean(a.onboarded)),
        esc(a.permissions.join(";")),
        esc(a.createdAt),
      ].join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `techsteal-members-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    show("Exported", `Downloaded ${list.length} member row(s) as CSV.`);
  };

  const normalizedQuery = query.trim().toLowerCase();
  const visibleAccounts = useMemo(
    () =>
      accounts.filter((account) => {
        if (!matchesSearch(account, normalizedQuery)) return false;
        if (filter === "admins") return account.role === "admin";
        if (filter === "verified") return Boolean(account.discordVerified);
        if (filter === "mc_linked") return Boolean(account.minecraftUsername);
        if (filter === "needs_setup") return !account.discordVerified || !account.onboarded;
        return true;
      }),
    [accounts, filter, normalizedQuery]
  );

  const visibleBanned = useMemo(
    () => banned.filter((account) => matchesSearch(account, normalizedQuery)),
    [banned, normalizedQuery]
  );

  const adminCount = accounts.filter((account) => account.role === "admin").length;
  const verifiedCount = accounts.filter((account) => account.discordVerified).length;
  const mcLinkedCount = accounts.filter((account) => Boolean(account.minecraftUsername)).length;
  const pendingCount = accounts.filter((account) => !account.discordVerified || !account.onboarded).length;

  const activeSection = SECTIONS.find((s) => s.id === panel) ?? SECTIONS[0];

  const handleTabKeyDown = (event: React.KeyboardEvent, idx: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextIdx = (idx + delta + SECTIONS.length) % SECTIONS.length;
    setPanel(SECTIONS[nextIdx].id);
    tabRefs.current[nextIdx]?.focus();
  };

  const permissionButtons = (account: Account) => {
    const inheritedByRoleOrVerify = account.role === "admin" || account.discordVerified === true;
    return (
      <div className="admin-permission-list">
        {PERMISSIONS.map((permission) => {
          const explicit = account.permissions.includes(permission.id);
          const inheritedOnly = !explicit && inheritedByRoleOrVerify;
          const activeClass = explicit ? "is-active" : inheritedOnly ? "is-inherited" : "";
          const reason = explicit
            ? `${permission.description} · Explicitly granted (click to revoke manual grant)`
            : inheritedOnly
              ? `${permission.description} · Active automatically via ${
                  account.role === "admin" ? "Admin role" : "Discord verification"
                } (click to add manual override)`
              : `${permission.description} · Click to grant manual override`;
          return (
            <button
              key={permission.id}
              type="button"
              className={`admin-permission ${activeClass}`}
              aria-pressed={explicit}
              aria-label={`${explicit ? "Revoke" : "Grant"} ${permission.label} for ${account.username}`}
              title={reason}
              onClick={() => togglePermission(account, permission.id)}
              disabled={busyId === account.id}
            >
              <i className={`fa-solid ${permission.icon}`} aria-hidden="true" />
              <span>{permission.shortLabel}</span>
              <i
                className={`fa-solid ${
                  explicit ? "fa-check" : inheritedOnly ? "fa-shield-halved" : "fa-plus"
                } admin-permission-state`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    );
  };

  const roleSelect = (account: Account) => {
    const isSelf = account.id === currentUser.id;
    return (
      <div className="admin-role-wrap" data-role={account.role}>
        <span className="admin-role-dot" aria-hidden="true" />
        <select
          className="admin-role-select"
          value={account.role}
          onChange={(event) => void save(account.id, { role: event.target.value as Account["role"] })}
          disabled={busyId === account.id || isSelf}
          aria-label={`Role for ${account.username}`}
          title={isSelf ? "You can't change your own role" : "Change role"}
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </div>
    );
  };

  return (
    <SubPage className="max-w-[1500px]">
      <div className="admin-page w-full">
        <header className="admin-header">
          <div>
            <div className="admin-eyebrow">
              <i className="fa-solid fa-shield-halved" aria-hidden="true" /> Administration
            </div>
            <h1 className="page-title">{activeSection.title}</h1>
            <p>{activeSection.subtitle}</p>
          </div>
          <div className="admin-header-actions">
            <div className="admin-signed-in">
              <Avatar name={currentUser.username} src={currentUser.avatarUrl ?? null} size="sm" />
              <div>
                <span>Signed in as</span>
                <strong>{currentUser.username}</strong>
              </div>
            </div>
            {panel === "members" ? (
              <button
                type="button"
                className="admin-refresh"
                onClick={() => void load()}
                disabled={refreshing || loading}
                title="Refresh member directory"
              >
                <i className={`fa-solid fa-rotate ${refreshing ? "fa-spin" : ""}`} aria-hidden="true" />
                <span>Refresh</span>
              </button>
            ) : null}
          </div>
        </header>

        <div className="admin-panel-tabs" role="tablist" aria-label="Admin sections">
          {SECTIONS.map((sec, idx) => {
            const selected = panel === sec.id;
            return (
              <button
                key={sec.id}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                id={`admin-tab-${sec.id}`}
                type="button"
                role="tab"
                tabIndex={selected ? 0 : -1}
                aria-selected={selected}
                aria-controls={`admin-panel-${sec.id}`}
                className={selected ? "is-active" : ""}
                onClick={() => setPanel(sec.id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
              >
                <i className={`fa-solid ${sec.icon}`} aria-hidden="true" /> {sec.label}
              </button>
            );
          })}
        </div>

        <div
          id={`admin-panel-${panel}`}
          role="tabpanel"
          aria-labelledby={`admin-tab-${panel}`}
        >
          {panel === "overview" ? (
            <AdminOverview onNavigate={setPanel} />
          ) : panel === "audit" ? (
            <AuditLog />
          ) : panel === "content" ? (
            <ContentCmsPanel />
          ) : panel === "moderation" ? (
            <ModerationPanel />
          ) : panel === "server" ? (
            <ServerPanel />
          ) : (
            <>
              <section className="admin-metrics" aria-label="Member overview">
                <div className="admin-metric">
                  <span className="admin-metric-icon is-blue">
                    <i className="fa-solid fa-users" aria-hidden="true" />
                  </span>
                  <div>
                    <span>Active members</span>
                    <strong>{loading ? "—" : accounts.length}</strong>
                  </div>
                </div>
                <div className="admin-metric">
                  <span className="admin-metric-icon is-purple">
                    <i className="fa-solid fa-user-shield" aria-hidden="true" />
                  </span>
                  <div>
                    <span>Administrators</span>
                    <strong>{loading ? "—" : adminCount}</strong>
                  </div>
                </div>
                <div className="admin-metric">
                  <span className="admin-metric-icon is-green">
                    <i className="fa-brands fa-discord" aria-hidden="true" />
                  </span>
                  <div>
                    <span>Discord verified · {loading ? "—" : `${mcLinkedCount} MC`}</span>
                    <strong>{loading ? "—" : verifiedCount}</strong>
                  </div>
                </div>
                <div className="admin-metric">
                  <span className={`admin-metric-icon ${pendingCount ? "is-amber" : "is-slate"}`}>
                    <i className="fa-solid fa-user-clock" aria-hidden="true" />
                  </span>
                  <div>
                    <span>Needs attention</span>
                    <strong>{loading ? "—" : pendingCount}</strong>
                  </div>
                </div>
              </section>

              <section className="admin-directory">
                <div className="admin-directory-head">
                  <div>
                    <h2>Access directory</h2>
                    <p>
                      Changes apply immediately. Dashed shield perks indicate capabilities included via Admin role or Discord verification.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="admin-action-btn"
                      onClick={exportMembersCsv}
                      disabled={(view === "members" ? visibleAccounts.length : visibleBanned.length) === 0}
                    >
                      <i className="fa-solid fa-file-arrow-down" aria-hidden="true" /> Export CSV
                    </button>
                    <div className="admin-directory-tabs" role="tablist" aria-label="Account status">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={view === "members"}
                        className={view === "members" ? "is-active" : ""}
                        onClick={() => setView("members")}
                      >
                        Active <span>{accounts.length}</span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={view === "removed"}
                        className={view === "removed" ? "is-active" : ""}
                        onClick={() => setView("removed")}
                      >
                        Removed <span>{banned.length}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="admin-toolbar">
                  <label className="admin-search">
                    <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                    <span className="sr-only">Search accounts</span>
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search name, Minecraft user, email, or ID…"
                    />
                    {query ? (
                      <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                      </button>
                    ) : null}
                  </label>
                  {view === "members" ? (
                    <div className="admin-filters" aria-label="Filter members">
                      {(
                        [
                          ["all", "All", accounts.length],
                          ["admins", "Admins", adminCount],
                          ["verified", "Verified", verifiedCount],
                          ["mc_linked", "MC Linked", mcLinkedCount],
                          ["needs_setup", "Needs setup", pendingCount],
                        ] as Array<[MemberFilter, string, number]>
                      ).map(([id, label, count]) => (
                        <button
                          key={id}
                          type="button"
                          className={filter === id ? "is-active" : ""}
                          aria-pressed={filter === id}
                          onClick={() => setFilter(id)}
                        >
                          {label} <span>{count}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="admin-removed-note">
                      <i className="fa-solid fa-circle-info" aria-hidden="true" /> Restoring re-enables sign-in with the member&apos;s previous access.
                    </div>
                  )}
                </div>

                {loading ? (
                  <div className="admin-loading" aria-label="Loading members">
                    {[0, 1, 2, 3].map((row) => (
                      <div key={row} />
                    ))}
                  </div>
                ) : loadError ? (
                  <EmptyState
                    className="admin-empty"
                    icon="fa-triangle-exclamation"
                    title="Member directory is unavailable"
                    hint={loadError}
                    action={
                      <button type="button" className="btn-secondary btn-sm" onClick={() => void load()}>
                        <i className="fa-solid fa-rotate" aria-hidden="true" /> Retry
                      </button>
                    }
                  />
                ) : view === "members" ? (
                  visibleAccounts.length === 0 ? (
                    <EmptyState
                      className="admin-empty"
                      icon={accounts.length === 0 ? "fa-users" : "fa-magnifying-glass"}
                      title={accounts.length === 0 ? "No member accounts yet" : "No members match this view"}
                      hint={
                        accounts.length === 0
                          ? "Accounts appear after their first Discord sign-in."
                          : "Try another search or clear the current filter."
                      }
                      action={
                        accounts.length > 0 ? (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => {
                              setQuery("");
                              setFilter("all");
                            }}
                          >
                            Clear filters
                          </button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <>
                      <div className="admin-table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Member</th>
                              <th>Account status</th>
                              <th>Role</th>
                              <th>Capability access</th>
                              <th>
                                <span className="sr-only">Actions</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleAccounts.map((account) => {
                              const isSelf = account.id === currentUser.id;
                              const busy = busyId === account.id;
                              return (
                                <tr key={account.id} className={busy ? "is-busy" : ""}>
                                  <td>
                                    <MemberIdentity account={account} isSelf={isSelf} />
                                  </td>
                                  <td>
                                    <AccountStatus account={account} />
                                  </td>
                                  <td>{roleSelect(account)}</td>
                                  <td>{permissionButtons(account)}</td>
                                  <td className="admin-action-cell">
                                    <button
                                      type="button"
                                      className="admin-icon-button mr-1"
                                      onClick={() => openMemberModal(account)}
                                      disabled={busy}
                                      aria-label={`Edit details for ${account.username}`}
                                      title="Edit Minecraft IGN, Discord verification & profile"
                                    >
                                      <i className="fa-solid fa-user-pen" aria-hidden="true" />
                                    </button>
                                    {!isSelf ? (
                                      <button
                                        type="button"
                                        className="admin-remove-button"
                                        onClick={() => setConfirmRemove(account)}
                                        disabled={busy}
                                        aria-label={`Remove ${account.username}`}
                                        title="Remove member"
                                      >
                                        <i className="fa-solid fa-user-slash" aria-hidden="true" />
                                      </button>
                                    ) : (
                                      <span className="admin-protected" title="Your account is protected">
                                        <i className="fa-solid fa-lock" aria-hidden="true" />
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="admin-mobile-list">
                        {visibleAccounts.map((account) => {
                          const isSelf = account.id === currentUser.id;
                          const busy = busyId === account.id;
                          return (
                            <article key={account.id} className={`admin-mobile-member ${busy ? "is-busy" : ""}`}>
                              <div className="admin-mobile-member-head">
                                <MemberIdentity account={account} isSelf={isSelf} />
                                {roleSelect(account)}
                              </div>
                              <AccountStatus account={account} />
                              <div className="admin-mobile-section-label">Capability access</div>
                              {permissionButtons(account)}
                              <div className="admin-mobile-actions">
                                <button
                                  type="button"
                                  className="admin-action-btn"
                                  onClick={() => openMemberModal(account)}
                                  disabled={busy}
                                >
                                  <i className="fa-solid fa-user-pen" aria-hidden="true" /> Manage profile
                                </button>
                                {!isSelf ? (
                                  <button
                                    type="button"
                                    className="admin-mobile-remove"
                                    onClick={() => setConfirmRemove(account)}
                                    disabled={busy}
                                  >
                                    <i className="fa-solid fa-user-slash" aria-hidden="true" /> Remove
                                  </button>
                                ) : null}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </>
                  )
                ) : visibleBanned.length === 0 ? (
                  <EmptyState
                    className="admin-empty"
                    icon={banned.length === 0 ? "fa-user-check" : "fa-magnifying-glass"}
                    title={banned.length === 0 ? "No removed accounts" : "No removed accounts match your search"}
                    hint={
                      banned.length === 0
                        ? "Removed members will appear here and can be restored at any time."
                        : "Try a different name, email, or account ID."
                    }
                  />
                ) : (
                  <div className="admin-removed-list">
                    {visibleBanned.map((account) => (
                      <article key={account.id} className={busyId === account.id ? "is-busy" : ""}>
                        <MemberIdentity account={account} />
                        <div className="admin-removed-status">
                          <span>
                            <i className="fa-solid fa-ban" aria-hidden="true" /> Sign-in blocked
                          </span>
                          <small>Previous role: {account.role}</small>
                        </div>
                        <button
                          type="button"
                          className="admin-restore-button"
                          onClick={() => void restore(account)}
                          disabled={busyId === account.id}
                        >
                          <i className="fa-solid fa-rotate-left" aria-hidden="true" /> Restore access
                        </button>
                      </article>
                    ))}
                  </div>
                )}

                {!loading && !loadError ? (
                  <footer className="admin-directory-footer">
                    <span>
                      Showing {view === "members" ? visibleAccounts.length : visibleBanned.length} of{" "}
                      {view === "members" ? accounts.length : banned.length} accounts
                    </span>
                    <span>
                      <i className="fa-solid fa-database" aria-hidden="true" /> Changes save directly to the member database
                    </span>
                  </footer>
                ) : null}
              </section>
            </>
          )}
        </div>
      </div>

      {editingMember ? (
        <Modal
          label={`Manage ${editingMember.username}`}
          onClose={() => {
            if (!modalBusy) setEditingMember(null);
          }}
          cardClassName="admin-edit-modal"
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={editingMember.username} src={editingMember.avatarUrl ?? null} size="sm" />
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold truncate">{editingMember.username}</h2>
                <div className="text-xs text-[var(--muted-2)] font-mono truncate">{editingMember.id}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditingMember(null)}
              disabled={modalBusy !== null}
              className="admin-icon-button"
              aria-label="Close"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>

          <div className="grid gap-4">
            <div>
              <label htmlFor="admin-edit-mc" className="block text-xs font-semibold text-[var(--fg-2)] mb-1.5">
                Linked Minecraft username
              </label>
              <div className="flex items-center gap-2.5">
                {mcDraft.trim() && isValidMcName(mcDraft.trim()) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={minotarUrl(mcDraft.trim(), 40)}
                    alt=""
                    width={38}
                    height={38}
                    className="rounded-[10px] border border-[var(--border)] flex-none"
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : null}
                <input
                  id="admin-edit-mc"
                  value={mcDraft}
                  onChange={(e) => setMcDraft(e.target.value)}
                  maxLength={16}
                  placeholder="Leave empty to unlink"
                  className="input flex-1"
                />
                {mcDraft.trim() && isValidMcName(mcDraft.trim()) ? (
                  <button
                    type="button"
                    onClick={() => void quickWhitelistMember(mcDraft.trim())}
                    disabled={modalBusy !== null}
                    className="admin-action-btn whitespace-nowrap"
                    title="Add this username directly to Exaroton's server whitelist"
                  >
                    <i className="fa-solid fa-user-check" aria-hidden="true" /> Whitelist
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] p-3.5 grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-[var(--fg)]">Discord server verification</div>
                  <div className="text-[11px] text-[var(--muted)]">
                    Query the Discord bot live or toggle verification manually.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void recheckDiscordGuild()}
                  disabled={modalBusy !== null}
                  className="admin-action-btn"
                >
                  <i
                    className={`fa-brands fa-discord ${modalBusy === "reverify" ? "fa-fade" : ""}`}
                    aria-hidden="true"
                  />{" "}
                  {modalBusy === "reverify" ? "Checking…" : "Re-check Discord"}
                </button>
              </div>

              <label className="inline-flex items-center gap-2.5 text-xs text-[var(--fg-2)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={verifiedDraft}
                  onChange={(e) => setVerifiedDraft(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Discord verified badge &amp; perks active
              </label>

              <label className="inline-flex items-center gap-2.5 text-xs text-[var(--fg-2)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onboardedDraft}
                  onChange={(e) => setOnboardedDraft(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Onboarding completed (hides reminder banner)
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[var(--border)]">
              {editingMember.minecraftUsername ? (
                <Link
                  href={`/members/${encodeURIComponent(editingMember.id)}`}
                  className="text-xs text-[var(--accent-bright)] hover:underline"
                >
                  View public profile <i className="fa-solid fa-arrow-up-right-from-square ml-1" aria-hidden="true" />
                </Link>
              ) : (
                <span className="text-xs text-[var(--muted-2)]">Link an MC username to enable public profile</span>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setEditingMember(null)}
                  disabled={modalBusy !== null}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => void saveMemberProfile()}
                  disabled={modalBusy !== null}
                >
                  {modalBusy === "save" ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {confirmRemove ? (
        <Modal
          label={`Remove ${confirmRemove.username}`}
          onClose={() => {
            if (busyId !== confirmRemove.id) setConfirmRemove(null);
          }}
          cardClassName="admin-confirm-modal"
        >
          <div className="admin-confirm-icon">
            <i className="fa-solid fa-user-slash" aria-hidden="true" />
          </div>
          <div>
            <span className="admin-confirm-kicker">Remove member</span>
            <h2>Block {confirmRemove.username} from signing in?</h2>
            <p>
              Their account and current access settings will be preserved, but they won&apos;t be able to sign in until an administrator restores them.
            </p>
          </div>
          <div className="admin-confirm-actions">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setConfirmRemove(null)}
              disabled={busyId === confirmRemove.id}
            >
              Cancel
            </button>
            <button
              type="button"
              className="admin-confirm-remove"
              onClick={() => void remove(confirmRemove)}
              disabled={busyId === confirmRemove.id}
            >
              {busyId === confirmRemove.id ? (
                <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
              ) : (
                <i className="fa-solid fa-user-slash" aria-hidden="true" />
              )}{" "}
              Remove member
            </button>
          </div>
        </Modal>
      ) : null}
    </SubPage>
  );
}
