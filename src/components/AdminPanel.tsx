"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/components/Toast";
import { SubPage } from "@/components/SubPage";
import type { Account, Permission, SessionUser } from "@/types";

const PERMISSION_LABELS: Record<Permission, { label: string; icon: string }> = {
  server_control: { label: "Server Control", icon: "fa-server" },
  ai_access: { label: "AI Agent", icon: "fa-robot" },
};

export function AdminPanel({ currentUser }: { currentUser: SessionUser }) {
  const { show } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/members");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { accounts: Account[] };
      setAccounts(data.accounts);
    } catch {
      show("Failed to load members", "Are you signed in as an admin?");
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (id: string, patch: Partial<Account>) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) throw new Error();
      await load();
      show("Saved", "Member updated.");
    } catch {
      show("Couldn't save", "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleRole = (account: Account) =>
    void save(account.id, { role: account.role === "admin" ? "member" : "admin" });

  const togglePermission = (account: Account, permission: Permission) => {
    const has = account.permissions.includes(permission);
    const next = has
      ? account.permissions.filter((p) => p !== permission)
      : [...account.permissions, permission];
    void save(account.id, { permissions: next });
  };

  const remove = async (account: Account) => {
    setBusyId(account.id);
    try {
      const res = await fetch("/api/admin/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id }),
      });
      if (!res.ok) throw new Error();
      await load();
      show("Removed", `${account.username} was removed.`);
    } catch {
      show("Couldn't remove", "Something went wrong.");
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
                    <Avatar
                      name={account.username}
                      src={account.avatarUrl}
                      size="sm"
                      className="!w-10 !h-10 flex-shrink-0"
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

        {/* Info note */}
        <p className="text-xs text-[var(--muted-2)] mt-8">
          Signed in as <span className="text-[var(--accent)]">{currentUser.username}</span> ·
          Accounts are stored in the database and created on Discord sign-in.
        </p>
      </div>
    </SubPage>
  );
}
