"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function Settings() {
  const { user, logout } = useAuth();
  const [code, setCode] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [promoteMsg, setPromoteMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
        // Refresh the page so the session cookie + role update everywhere.
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

  return (
    <div>

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
              <span className={`role-pill ${user?.role === "admin" ? "role-pill--admin" : ""}`}>
                {user?.role === "admin" ? "Admin" : "Member"}
              </span>
            </div>
          </div>

          {user?.role !== "admin" && (
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
        </div>
      </div>
    </div>
  );
}
