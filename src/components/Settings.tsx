"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { SITE_VERSION } from "@/lib/version";
import { fetchAdminUsers, updateUserRoleAdmin } from "@/lib/api";
import { useToast } from "@/components/Toast";

type AdminUser = {
  id: number;
  discord_id: string;
  role: "admin" | "member";
  username: string;
  created_at: string;
};

export default function Settings() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === "admin";
  const [code, setCode] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [promoteMsg, setPromoteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Admin user management state
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [updatingDiscordId, setUpdatingDiscordId] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await fetchAdminUsers();
      setAdminUsers(data);
    } catch {
      showToast("Failed to load user permissions.", "error");
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleToggleRole = async (targetUser: AdminUser) => {
    const newRole: "admin" | "member" = targetUser.role === "admin" ? "member" : "admin";
    setUpdatingDiscordId(targetUser.discord_id);
    try {
      await updateUserRoleAdmin(targetUser.discord_id, newRole);
      setAdminUsers((prev) =>
        prev.map((u) => (u.discord_id === targetUser.discord_id ? { ...u, role: newRole } : u))
      );
      showToast(`Updated ${targetUser.username}'s role to ${newRole}.`, "success");
    } catch (e: any) {
      showToast(e?.message || "Failed to update role.", "error");
    } finally {
      setUpdatingDiscordId(null);
    }
  };

  const handlePromote = async () => {
    setPromoting(true);
    setPromoteMsg(null);
    try {
      const res = await fetch("/api/auth/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setPromoteMsg({ ok: true, text: "You are now an admin!" });
        window.location.reload();
      } else {
        setPromoteMsg({ ok: false, text: json.error || "Failed to promote." });
      }
    } catch {
      setPromoteMsg({ ok: false, text: "Something went wrong." });
    } finally {
      setPromoting(false);
    }
  };

  const filteredUsers = adminUsers.filter(
    (u) =>
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.discord_id.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div>
      <div className="card" style={{ marginBottom: "20px" }}>
        <div className="card__title"><span className="dot" />Profile</div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
          <div
            className="post-detail__avatar"
            style={{ width: "64px", height: "64px", fontSize: "1.5rem" }}
          >
            {user?.avatar ? <img src={user.avatar} alt="" /> : user?.username?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{user?.username}</div>
            <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
              Discord ID: {user?.discordId}
            </div>
          </div>
        </div>

        <div className="settings-form">
          {isAdmin && (
            <div>
              <label className="settings-label">Role</label>
              <div style={{ marginTop: "6px" }}>
                <span className="role-pill role-pill--admin">Admin</span>
              </div>
            </div>
          )}

          {!isAdmin && (
            <div style={{ marginTop: "18px" }}>
              <label className="settings-label">Admin Unlock Code</label>
              <div style={{ display: "flex", gap: "10px", marginTop: "8px", flexWrap: "wrap" }}>
                <input
                  className="settings-input"
                  type="password"
                  value={code}
                  placeholder="Enter code"
                  onChange={(e) => setCode(e.target.value)}
                  style={{ flex: "1 1 200px" }}
                />
                <button className="btn btn--start" disabled={promoting || !code} onClick={handlePromote}>
                  {promoting ? "Verifying…" : "Unlock Admin"}
                </button>
              </div>
              {promoteMsg && (
                <div style={{ marginTop: "8px", color: promoteMsg.ok ? "var(--green)" : "var(--redstone)", fontSize: "0.85rem", fontWeight: 700 }}>
                  {promoteMsg.text}
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: "12px" }}>
            <button className="btn btn--ghost" onClick={logout}>
              Logout
            </button>
          </div>

          {isAdmin && (
            <div className="version-block">
              <div>
                <label className="settings-label">Site Version</label>
                <div className="version-block__value">{SITE_VERSION}</div>
              </div>
              <a
                className="version-block__link"
                href="https://github.com/HOT18594/Techsteal-Website/commits/master"
                target="_blank"
                rel="noopener"
              >
                View changelog ↗
              </a>
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="card">
          <div className="card__title"><span className="dot" />Admin: Account Permissions</div>
          <div style={{ marginBottom: "16px", color: "var(--text-soft)", fontSize: "0.9rem" }}>
            Manage user roles and permissions across Techsteal. Admins have access to server controls, blog publishing, season editing, and post moderation.
          </div>

          <div className="search-bar" style={{ marginBottom: "16px" }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              className="search-bar__input"
              placeholder="Search users by name or Discord ID..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
            {userSearch && (
              <button className="search-bar__clear show" onClick={() => setUserSearch("")}>
                ×
              </button>
            )}
          </div>

          {loadingUsers ? (
            <div className="status-spinner-wrapper">
              <div className="status-spinner" />
              <span>Loading user accounts...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="empty-state">No user accounts found.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {filteredUsers.map((u) => {
                const isSelf = u.discord_id === user?.discordId;
                const isUpdating = updatingDiscordId === u.discord_id;
                return (
                  <div
                    key={u.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      background: "var(--panel-2)",
                      border: "1px solid var(--line)",
                      borderRadius: "var(--radius-sm)",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div
                        className="post-detail__avatar"
                        style={{ width: "40px", height: "40px", fontSize: "1rem" }}
                      >
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: "var(--ink)" }}>
                          {u.username} {isSelf && <span style={{ color: "var(--green)", fontSize: "0.8rem" }}>(You)</span>}
                        </div>
                        <div style={{ color: "var(--text-dim)", fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>
                          ID: {u.discord_id}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span className={`role-pill ${u.role === "admin" ? "role-pill--admin" : ""}`}>
                        {u.role === "admin" ? "Admin" : "Member"}
                      </span>

                      {!isSelf && (
                        <button
                          className={`btn ${u.role === "admin" ? "btn--ghost" : "btn--start"}`}
                          style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                          disabled={isUpdating}
                          onClick={() => handleToggleRole(u)}
                        >
                          {isUpdating
                            ? "Updating..."
                            : u.role === "admin"
                            ? "Demote to Member"
                            : "Make Admin"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

