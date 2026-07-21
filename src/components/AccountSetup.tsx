"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

// AccountSetup — shown to brand-new users after their first Discord login.
// They pick a display name and acknowledge the rules before entering the app.
export default function AccountSetup() {
  const { user, completeSetup } = useAuth();
  const [username, setUsername] = useState(user?.username || "");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmed = username.trim();
    if (trimmed.length < 2 || trimmed.length > 32) {
      setError("Display name must be 2–32 characters.");
      return;
    }
    if (!agreed) {
      setError("You must agree to the rules to continue.");
      return;
    }

    setSubmitting(true);
    await completeSetup(trimmed);
    setSubmitting(false);
    // completeSetup updates the user state in context; the app shell will
    // re-render and show the main app because isNewUser becomes false.
  };

  return (
    <div className="splash">
      <div className="splash__inner" style={{ maxWidth: 460 }}>
        <img className="splash__logo" src="/img/logo.png" alt="TechSteal" />
        <h2 style={{ textAlign: "center", margin: "10px 0 20px", fontFamily: "'Barlow Condensed', Impact, sans-serif", textTransform: "uppercase", fontWeight: 800 }}>
          Welcome to TechSteal
        </h2>
        <p style={{ textAlign: "center", opacity: 0.8, marginBottom: 24, fontSize: 14 }}>
          New account setup — pick your display name to get started.
        </p>

        {user?.avatar && (
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <img
              src={user.avatar}
              alt="Discord avatar"
              style={{ width: 64, height: 64, borderRadius: "50%", border: "2px solid var(--accent, #5865F2)" }}
            />
          </div>
        )}

        <form onSubmit={handleSubmit} className="login" style={{ gap: 12, display: "flex", flexDirection: "column" }}>
          <label style={{ fontSize: 13, opacity: 0.8 }}>Display Name</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Choose a display name"
            maxLength={32}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.05)",
              color: "white",
              fontSize: 15,
            }}
            autoFocus
          />

          <label
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, opacity: 0.85, marginTop: 8, cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            I agree to follow the community rules and be respectful.
          </label>

          {error && (
            <div className="login__error show" style={{ display: "block" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="login__btn login__btn--discord"
            disabled={submitting}
            style={{ marginTop: 8 }}
          >
            {submitting ? "Creating account..." : "Finish Setup"}
          </button>
        </form>
      </div>
    </div>
  );
}
