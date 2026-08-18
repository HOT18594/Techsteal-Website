"use client";

import { useCallback, useEffect, useState } from "react";
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

  // Add-account form state.
  const [showAdd, setShowAdd] = useState(false);
  const [newId, setNewId] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newRole, setNewRole] = useState<"member" | "admin">("member");

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

  const addAccount = async () => {
    const id = newId.trim();
    const username = newUsername.trim();
    if (!id || !username) {
      show("Fill in all fields", "id and username are required.");
      return;
    }
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ create: true, id, username, role: newRole }),
      });
      if (!res.ok) throw new Error();
      setNewId("");
      setNewUsername("");
      setShowAdd(false);
      await load();
      show("Added", `${username} is now a member.`);
    } catch {
      show("Couldn't add", "Something went wrong.");
    }
  };

  return (
    <SubPage className="mx-auto max-w-4xl pt-6 pb-16">
      <div className="max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="page-header rowed mb-8">
          <div>
            <span className="page-kicker">
              <i className="fa-solid fa-shield-halved" aria-hidden="true" />
              Admin · Manage
            </span>
            <h1 className="page-title">Manage Panel</h1>
          </div>
          <button className="btn-secondary py-2.5! px-5! text-xs!" onClick={() => setShowAdd((s) => !s)}>
            <i className="fa-solid fa-user-plus" />
            Add Member
          </button>
        </div>

        {/* Add member form */}
        {showAdd ? (
          <div className="card p-6 mb-8 space-y-4">
            <h3 className="font-display text-lg font-bold">Add Member</h3>
            <div className="grid sm:grid-cols-3 gap-3">
              <input
                className="w-full bg-[var(--bg-2)] border border-[var(--border)] px-4 py-2.5 text-sm rounded-lg outline-none focus:border-[var(--accent)] transition placeholder:text-[var(--muted-2)]"
                placeholder="Account id (e.g. jordan)"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
              <input
                className="w-full bg-[var(--bg-2)] border border-[var(--border)] px-4 py-2.5 text-sm rounded-lg outline-none focus:border-[var(--accent)] transition placeholder:text-[var(--muted-2)]"
                placeholder="Username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
              <select
                className="w-full bg-[var(--bg-2)] border border-[var(--border)] px-4 py-2.5 text-sm rounded-lg outline-none focus:border-[var(--accent)] transition"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as "member" | "admin")}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button className="btn-primary py-2.5! px-5! text-xs!" onClick={() => void addAccount()}>
                <i className="fa-solid fa-check" />
                Create
              </button>
              <button className="btn-secondary py-2.5! px-5! text-xs!" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {/* Accounts */}
        {loading ? (
          <p className="text-sm text-[var(--muted)] text-center py-12">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-[var(--muted)] text-center py-12">No members yet.</p>
        ) : (
          <div className="space-y-3">
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
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center font-display font-bold text-white flex-shrink-0">
                      {account.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {account.username}
                        {isSelf ? (
                          <span className="ml-2 text-xs text-[var(--muted)]">(you)</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-[var(--muted)]">id · {account.id}</div>
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
          Demo account store — connects to the real DB (and Discord roles) later.
        </p>
      </div>
    </SubPage>
  );
}
