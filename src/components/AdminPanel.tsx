"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/components/Toast";
import { SubPage } from "@/components/SubPage";
import type { Account, Permission, SessionUser } from "@/types";

const PERMISSION_LABELS: Record<Permission, { label: string; icon: string }> = {
  server_control: { label: "Server Control", icon: "fa-server" },
  ai_access: { label: "AI Agent", icon: "fa-robot" },
  gallery_post: { label: "Gallery Post", icon: "fa-image" },
};

/** What POST /api/admin/members accepts. Permission changes go as deltas. */
type AdminPatch = {
  role?: Account["role"];
  grant?: Permission[];
  revoke?: Permission[];
};

export function AdminPanel({ currentUser }: { currentUser: SessionUser }) {
  const { show } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [banned, setBanned] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
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
      show(
        "Failed to load members",
        err instanceof Error ? err.message : "Are you signed in as an admin?",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    void load();
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
      // The server explains WHY ("You can't demote yourself.", a 503 during a
      // pooler blip); throwing a bare Error discarded that and every failure
      // read "Something went wrong."
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      await load();
      show("Saved", "Member updated.");
    } catch (err) {
      show("Couldn't save", err instanceof Error ? err.message : "Something went wrong.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const toggleRole = (account: Account) =>
    void save(account.id, { role: account.role === "admin" ? "member" : "admin" });

  const togglePermission = (account: Account, permission: Permission) => {
    // Send the DELTA, not the recomputed whole array: the array came from
    // render state, so two quick toggles (or another admin's change landing
    // between the render and the click) wrote back a list that had already
    // gone stale and silently reverted the other change. The server applies
    // grant/revoke in SQL against the current row.
    const has = account.permissions.includes(permission);
    void save(account.id, has ? { revoke: [permission] } : { grant: [permission] });
  };

  const remove = async (account: Account) => {
    // One stray click must not ban an account. Removing BANS the user —
    // they can't sign back in until restored below.
    if (!window.confirm(`Remove ${account.username}? They'll be blocked from signing in until restored.`)) return;
    setBusyId(account.id);
    try {
      const res = await fetch("/api/admin/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      await load();
      show("Removed", `${account.username} was removed.`);
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
      show("Restored", `${account.username} can sign in again.`);
    } catch (err) {
      show("Couldn't restore", err instanceof Error ? err.message : "Something went wrong.", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SubPage className="max-w-4xl">
      <div className="w-full">
        {/* Header */}
        <div className="page-header mb-8">
          <h1 className="page-title">Manage Panel</h1>
        </div>

        {/* Accounts */}
        {loading ? (
          <p className="text-sm text-[var(--muted)] text-center py-12">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-[var(--muted)] text-center py-12">
            No members yet — accounts are created when people sign in with Discord.
          </p>
        ) : (
          <div className="space-y-3 stagger">
            {accounts.map((account) => {
              const isSelf = account.id === currentUser.id;
              const busy = busyId === account.id;
              return (
                <div
                  key={account.id}
                  className="card p-5 flex flex-col md:flex-row md:items-center gap-4 md:gap-6"
                >
                  {/* Identity */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Discord identity — the admin panel manages Discord
                        accounts, so it shows the Discord PFP (no MC skin
                        fallback; a pixel placeholder fills in when absent). */}
                    <Avatar
                      name={account.username}
                      src={account.avatarUrl ?? null}
                      size="sm"
                      className="w-10! h-10! flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-medium break-words leading-snug">
                        {account.username}
                        {isSelf ? (
                          <span className="ml-2 text-xs text-[var(--muted)]">(you)</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {account.minecraftUsername ? (
                          <>
                            MC · <span className="text-[var(--fg-2)]">{account.minecraftUsername}</span> ·
                          </>
                        ) : null}{" "}
                        id · {account.id}
                      </div>
                    </div>
                  </div>

                  {/* Role */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--muted)] uppercase tracking-wider mr-1">Role</span>
                    <button
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                        account.role === "admin"
                          ? "bg-[var(--accent-dim)] border-[var(--accent)] text-[var(--accent)]"
                          : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]"
                      }`}
                      onClick={() => toggleRole(account)}
                      disabled={busy || isSelf}
                      title={isSelf ? "You can't change your own role" : "Toggle role"}
                    >
                      {account.role === "admin" ? "Admin" : "Member"}
                    </button>
                  </div>

                  {/* Permissions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {(Object.keys(PERMISSION_LABELS) as Permission[]).map((perm) => {
                      const enabled = account.permissions.includes(perm);
                      const meta = PERMISSION_LABELS[perm];
                      return (
                        <button
                          key={perm}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition flex items-center gap-1.5 ${
                            enabled
                              ? "bg-[var(--accent-dim)] border-[var(--accent)] text-[var(--accent)]"
                              : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] opacity-70"
                          }`}
                          onClick={() => togglePermission(account, perm)}
                          disabled={busy}
                          title={`Grant ${meta.label}`}
                        >
                          <i className={`fa-solid ${meta.icon} text-[10px]`} />
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Remove */}
                  {!isSelf ? (
                    <button
                      className="w-10 h-10 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--redstone)] hover:text-[var(--redstone)] transition disabled:opacity-50 flex-shrink-0"
                      onClick={() => void remove(account)}
                      disabled={busy}
                      aria-label={`Remove ${account.username}`}
                      title="Remove member"
                    >
                      <i className="fa-solid fa-trash" />
                    </button>
                  ) : (
                    <div className="w-10" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Banned (removed) accounts — restorable */}
        {!loading && banned.length > 0 ? (
          <div className="mt-10">
            <h2 className="font-display text-lg font-bold mb-4 flex items-center gap-2">
              <i className="fa-solid fa-ban text-[var(--redstone)] text-sm" />
              Removed accounts ({banned.length})
            </h2>
            <div className="space-y-2">
              {banned.map((account) => (
                <div
                  key={account.id}
                  className="card p-4 flex items-center justify-between gap-4 opacity-80"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={account.username} src={account.avatarUrl} size="sm" className="w-8! h-8!" />
                    <span className="text-sm font-medium truncate line-through decoration-[var(--redstone)]/60">
                      {account.username}
                    </span>
                    <span className="text-xs text-[var(--muted-2)] truncate hidden sm:inline">{account.id}</span>
                  </div>
                  <button
                    className="btn-secondary py-2! px-4! text-xs! flex-shrink-0"
                    onClick={() => void restore(account)}
                    disabled={busyId === account.id}
                  >
                    <i className="fa-solid fa-rotate-left" />
                    Restore
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--muted-2)] mt-3">
              Removed members can&apos;t sign in with Discord until restored.
            </p>
          </div>
        ) : null}

        {/* Info note */}
        <p className="text-xs text-[var(--muted-2)] mt-8">
          Signed in as <span className="text-[var(--accent)]">{currentUser.username}</span> ·
          Accounts are stored in the database and created on Discord sign-in.
        </p>
      </div>
    </SubPage>
  );
}
