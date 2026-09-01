"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { SubPage } from "@/components/SubPage";
import { useToast } from "@/components/Toast";
import type { Account, Permission, SessionUser } from "@/types";

const PERMISSIONS: Array<{
  id: Permission;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
}> = [
  { id: "server_control", label: "Server control", shortLabel: "Server", description: "Start and stop the Minecraft server", icon: "fa-server" },
  { id: "ai_access", label: "AI assistant", shortLabel: "AI", description: "Use Chatty Jr. and its server tools", icon: "fa-wand-magic-sparkles" },
  { id: "gallery_post", label: "Gallery posting", shortLabel: "Gallery", description: "Publish builds to the gallery", icon: "fa-images" },
];

/** What POST /api/admin/members accepts. Permission changes go as deltas. */
type AdminPatch = {
  role?: Account["role"];
  grant?: Permission[];
  revoke?: Permission[];
};

type DirectoryView = "members" | "removed";
type MemberFilter = "all" | "admins" | "needs_setup";

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
        <i className={`fa-solid ${account.discordVerified ? "fa-circle-check" : "fa-circle-minus"}`} />
        {account.discordVerified ? "Discord verified" : "Not verified"}
      </span>
      <span className={`admin-status ${account.onboarded ? "is-neutral" : "is-warning"}`}>
        <i className={`fa-solid ${account.onboarded ? "fa-check" : "fa-clock"}`} />
        {account.onboarded ? "Setup complete" : "Setup pending"}
      </span>
    </div>
  );
}

export function AdminPanel({ currentUser }: { currentUser: SessionUser }) {
  const { show } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [banned, setBanned] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useState<DirectoryView>("members");
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [query, setQuery] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<Account | null>(null);

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/members");
      const data = (await res.json().catch(() => ({}))) as {
        accounts?: Account[];
        bannedAccounts?: Account[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Are you signed in as an admin?");
      setAccounts(data.accounts ?? []);
      setBanned(data.bannedAccounts ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Are you signed in as an admin?";
      setLoadError(message);
      show("Failed to load members", message, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [show]);

  useEffect(() => {
    void load(true);
  }, [load]);

  /** POST a patch to /api/admin/members and refresh from the response. */
  const save = async (id: string, patch: AdminPatch) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      await load();
      show("Access updated", "The member's access has been saved.");
    } catch (err) {
      show("Couldn't save", err instanceof Error ? err.message : "Something went wrong.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const togglePermission = (account: Account, permission: Permission) => {
    // Deltas prevent concurrent edits from overwriting another admin's change.
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

  const normalizedQuery = query.trim().toLowerCase();
  const visibleAccounts = useMemo(() => accounts.filter((account) => {
    if (!matchesSearch(account, normalizedQuery)) return false;
    if (filter === "admins") return account.role === "admin";
    if (filter === "needs_setup") return !account.discordVerified || !account.onboarded;
    return true;
  }), [accounts, filter, normalizedQuery]);
  const visibleBanned = useMemo(
    () => banned.filter((account) => matchesSearch(account, normalizedQuery)),
    [banned, normalizedQuery]
  );

  const adminCount = accounts.filter((account) => account.role === "admin").length;
  const verifiedCount = accounts.filter((account) => account.discordVerified).length;
  const pendingCount = accounts.filter((account) => !account.discordVerified || !account.onboarded).length;

  const permissionButtons = (account: Account) => (
    <div className="admin-permission-list">
      {PERMISSIONS.map((permission) => {
        const enabled = account.permissions.includes(permission.id);
        return (
          <button
            key={permission.id}
            type="button"
            className={`admin-permission ${enabled ? "is-active" : ""}`}
            aria-pressed={enabled}
            aria-label={`${enabled ? "Revoke" : "Grant"} ${permission.label} for ${account.username}`}
            title={`${permission.description} · Click to ${enabled ? "revoke" : "grant"}`}
            onClick={() => togglePermission(account, permission.id)}
            disabled={busyId === account.id}
          >
            <i className={`fa-solid ${permission.icon}`} aria-hidden="true" />
            <span>{permission.shortLabel}</span>
            <i className={`fa-solid ${enabled ? "fa-check" : "fa-plus"} admin-permission-state`} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );

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
            <div className="admin-eyebrow"><i className="fa-solid fa-shield-halved" /> Administration</div>
            <h1 className="page-title">Member access</h1>
            <p>Manage roles, capabilities, and account access from one place.</p>
          </div>
          <div className="admin-header-actions">
            <div className="admin-signed-in">
              <Avatar name={currentUser.username} src={currentUser.avatarUrl ?? null} size="sm" />
              <div><span>Signed in as</span><strong>{currentUser.username}</strong></div>
            </div>
            <button type="button" className="admin-refresh" onClick={() => void load()} disabled={refreshing || loading} title="Refresh member data">
              <i className={`fa-solid fa-rotate ${refreshing ? "fa-spin" : ""}`} /><span>Refresh</span>
            </button>
          </div>
        </header>

        <section className="admin-metrics" aria-label="Member overview">
          <div className="admin-metric"><span className="admin-metric-icon is-blue"><i className="fa-solid fa-users" /></span><div><span>Active members</span><strong>{loading ? "—" : accounts.length}</strong></div></div>
          <div className="admin-metric"><span className="admin-metric-icon is-purple"><i className="fa-solid fa-user-shield" /></span><div><span>Administrators</span><strong>{loading ? "—" : adminCount}</strong></div></div>
          <div className="admin-metric"><span className="admin-metric-icon is-green"><i className="fa-brands fa-discord" /></span><div><span>Discord verified</span><strong>{loading ? "—" : verifiedCount}</strong></div></div>
          <div className="admin-metric"><span className={`admin-metric-icon ${pendingCount ? "is-amber" : "is-slate"}`}><i className="fa-solid fa-user-clock" /></span><div><span>Needs attention</span><strong>{loading ? "—" : pendingCount}</strong></div></div>
        </section>

        <section className="admin-directory">
          <div className="admin-directory-head">
            <div><h2>Access directory</h2><p>Changes are applied immediately and recorded against the member account.</p></div>
            <div className="admin-directory-tabs" role="tablist" aria-label="Account status">
              <button type="button" role="tab" aria-selected={view === "members"} className={view === "members" ? "is-active" : ""} onClick={() => setView("members")}>Active <span>{accounts.length}</span></button>
              <button type="button" role="tab" aria-selected={view === "removed"} className={view === "removed" ? "is-active" : ""} onClick={() => setView("removed")}>Removed <span>{banned.length}</span></button>
            </div>
          </div>

          <div className="admin-toolbar">
            <label className="admin-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" /><span className="sr-only">Search accounts</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, Minecraft user, email, or ID…" />
              {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><i className="fa-solid fa-xmark" /></button> : null}
            </label>
            {view === "members" ? (
              <div className="admin-filters" aria-label="Filter members">
                {([[
                  "all", "All", accounts.length,
                ], ["admins", "Admins", adminCount], ["needs_setup", "Needs attention", pendingCount]] as Array<[MemberFilter, string, number]>).map(([id, label, count]) => (
                  <button key={id} type="button" className={filter === id ? "is-active" : ""} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label} <span>{count}</span></button>
                ))}
              </div>
            ) : (
              <div className="admin-removed-note"><i className="fa-solid fa-circle-info" /> Restoring re-enables sign-in with the member&apos;s previous access.</div>
            )}
          </div>

          {loading ? (
            <div className="admin-loading" aria-label="Loading members">{[0, 1, 2, 3].map((row) => <div key={row} />)}</div>
          ) : loadError ? (
            <EmptyState className="admin-empty" icon="fa-triangle-exclamation" title="Member directory is unavailable" hint={loadError} action={<button type="button" className="btn-secondary btn-sm" onClick={() => void load()}><i className="fa-solid fa-rotate" /> Retry</button>} />
          ) : view === "members" ? (
            visibleAccounts.length === 0 ? (
              <EmptyState
                className="admin-empty"
                icon={accounts.length === 0 ? "fa-users" : "fa-magnifying-glass"}
                title={accounts.length === 0 ? "No member accounts yet" : "No members match this view"}
                hint={accounts.length === 0 ? "Accounts appear after their first Discord sign-in." : "Try another search or clear the current filter."}
                action={accounts.length > 0 ? <button type="button" className="btn-secondary btn-sm" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button> : undefined}
              />
            ) : (
              <>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>Member</th><th>Account status</th><th>Role</th><th>Capability access</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>
                      {visibleAccounts.map((account) => {
                        const isSelf = account.id === currentUser.id;
                        const busy = busyId === account.id;
                        return (
                          <tr key={account.id} className={busy ? "is-busy" : ""}>
                            <td><MemberIdentity account={account} isSelf={isSelf} /></td>
                            <td><AccountStatus account={account} /></td>
                            <td>{roleSelect(account)}</td>
                            <td>{permissionButtons(account)}</td>
                            <td className="admin-action-cell">
                              {!isSelf ? <button type="button" className="admin-remove-button" onClick={() => setConfirmRemove(account)} disabled={busy} aria-label={`Remove ${account.username}`} title="Remove member"><i className="fa-solid fa-user-slash" /></button> : <span className="admin-protected" title="Your account is protected"><i className="fa-solid fa-lock" /></span>}
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
                        <div className="admin-mobile-member-head"><MemberIdentity account={account} isSelf={isSelf} />{roleSelect(account)}</div>
                        <AccountStatus account={account} />
                        <div className="admin-mobile-section-label">Capability access</div>
                        {permissionButtons(account)}
                        {!isSelf ? <button type="button" className="admin-mobile-remove" onClick={() => setConfirmRemove(account)} disabled={busy}><i className="fa-solid fa-user-slash" /> Remove member</button> : null}
                      </article>
                    );
                  })}
                </div>
              </>
            )
          ) : visibleBanned.length === 0 ? (
            <EmptyState className="admin-empty" icon={banned.length === 0 ? "fa-user-check" : "fa-magnifying-glass"} title={banned.length === 0 ? "No removed accounts" : "No removed accounts match your search"} hint={banned.length === 0 ? "Removed members will appear here and can be restored at any time." : "Try a different name, email, or account ID."} />
          ) : (
            <div className="admin-removed-list">
              {visibleBanned.map((account) => (
                <article key={account.id} className={busyId === account.id ? "is-busy" : ""}>
                  <MemberIdentity account={account} />
                  <div className="admin-removed-status"><span><i className="fa-solid fa-ban" /> Sign-in blocked</span><small>Previous role: {account.role}</small></div>
                  <button type="button" className="admin-restore-button" onClick={() => void restore(account)} disabled={busyId === account.id}><i className="fa-solid fa-rotate-left" /> Restore access</button>
                </article>
              ))}
            </div>
          )}

          {!loading && !loadError ? (
            <footer className="admin-directory-footer">
              <span>Showing {view === "members" ? visibleAccounts.length : visibleBanned.length} of {view === "members" ? accounts.length : banned.length} accounts</span>
              <span><i className="fa-solid fa-database" /> Changes save directly to the member database</span>
            </footer>
          ) : null}
        </section>
      </div>

      {confirmRemove ? (
        <Modal label={`Remove ${confirmRemove.username}`} onClose={() => { if (busyId !== confirmRemove.id) setConfirmRemove(null); }} cardClassName="admin-confirm-modal">
          <div className="admin-confirm-icon"><i className="fa-solid fa-user-slash" /></div>
          <div><span className="admin-confirm-kicker">Remove member</span><h2>Block {confirmRemove.username} from signing in?</h2><p>Their account and current access settings will be preserved, but they won&apos;t be able to sign in until an administrator restores them.</p></div>
          <div className="admin-confirm-actions">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirmRemove(null)} disabled={busyId === confirmRemove.id}>Cancel</button>
            <button type="button" className="admin-confirm-remove" onClick={() => void remove(confirmRemove)} disabled={busyId === confirmRemove.id}>{busyId === confirmRemove.id ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-user-slash" />} Remove member</button>
          </div>
        </Modal>
      ) : null}
    </SubPage>
  );
}
