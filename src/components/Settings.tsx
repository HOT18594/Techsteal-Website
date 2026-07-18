"use client";

import { useAuth } from "@/lib/auth-context";

export default function Settings() {
  const { user, logout } = useAuth();

  return (
    <div>
      <div className="page-header">
        <h1 className="page-header__title">Settings</h1>
        <p className="page-header__sub">Manage your account and session.</p>
      </div>

      <div className="card">
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
          <div>
            <label className="settings-label">Role</label>
            <div style={{ marginTop: "6px" }}>
              <span
                className="badge-season"
                style={{
                  background: user?.role === "admin"
                    ? "linear-gradient(135deg, #f59e0b, #d97706)"
                    : "linear-gradient(135deg, var(--accent), var(--accent-2))",
                }}
              >
                {user?.role === "admin" ? "Admin" : "Member"}
              </span>
            </div>
          </div>

          <div style={{ marginTop: "12px" }}>
            <button className="btn btn--ghost" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__title"><span className="dot" />About</div>
        <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", lineHeight: 1.7 }}>
          TechSteal is a Minecraft community. This site is built with Next.js and
          uses Discord for authentication and Supabase for data storage.
        </p>
      </div>
    </div>
  );
}
