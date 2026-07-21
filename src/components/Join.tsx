"use client";

import { useState, useEffect } from "react";
import { loadSeasons, SERVER_ADDRESS, updateSeason, copyToClipboard } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/Toast";
import { sanitizeSeasonHtml } from "@/lib/sanitize";
import type { Season } from "@/lib/supabase";

const LAUNCHER_LABELS: Record<string, string> = {
  prism: "Prism",
  sklauncher: "SK Launcher",
  modrinth: "Modrinth",
  curseforge: "CurseForge",
};

export default function Join() {
  const { canAdmin } = useAuth();
  const { showToast } = useToast();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeasonId, setActiveSeasonId] = useState<number | null>(null);
  const [activeLauncher, setActiveLauncher] = useState<string>("prism");
  const [loading, setLoading] = useState(true);

  // Admin editor state
  const [editTitle, setEditTitle] = useState("");
  const [editCurrent, setEditCurrent] = useState(false);
  const [editLaunchers, setEditLaunchers] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await loadSeasons();
      setSeasons(data);
      if (data.length) {
        const current = data.find((s) => s.is_current);
        const targetId = current ? current.id : data[0].id;
        setActiveSeasonId(targetId);
        const season = current || data[0];
        setEditTitle(season.title || "");
        setEditCurrent(season.is_current || false);
        setEditLaunchers({
          prism: season.prism || "",
          sklauncher: season.sklauncher || "",
          modrinth: season.modrinth || "",
          curseforge: season.curseforge || "",
        });
      }
    } catch {
      // keep empty
    }
    setLoading(false);
  };

  const activeSeason = seasons.find((s) => s.id === activeSeasonId) || seasons[0] || null;

  const isAdmin = canAdmin;

  const handleSeasonSelect = (id: number) => {
    setActiveSeasonId(id);
    const season = seasons.find((s) => s.id === id);
    if (season) {
      setEditTitle(season.title || "");
      setEditCurrent(season.is_current || false);
      setEditLaunchers({
        prism: season.prism || "",
        sklauncher: season.sklauncher || "",
        modrinth: season.modrinth || "",
        curseforge: season.curseforge || "",
      });
    }
  };

  useEffect(() => {
    if (activeSeason) {
      setEditTitle(activeSeason.title || "");
      setEditCurrent(activeSeason.is_current || false);
      setEditLaunchers({
        prism: activeSeason.prism || "",
        sklauncher: activeSeason.sklauncher || "",
        modrinth: activeSeason.modrinth || "",
        curseforge: activeSeason.curseforge || "",
      });
    }
  }, [activeSeason?.id]);

  const handleCopy = async () => {
    try {
      await copyToClipboard(SERVER_ADDRESS);
      showToast("IP copied!", "success");
    } catch {
      showToast("Failed to copy", "error");
    }
  };

  if (loading) {
    return (
      <div className="status-spinner-wrapper">
        <div className="status-spinner" />
        <span>Loading seasons...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div className="card__title"><span className="dot" />Server Address</div>
        <div className="ip-box">
          <code>{SERVER_ADDRESS}</code>
          <button className="copy-btn" onClick={handleCopy}>
            Copy
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card__title"><span className="dot" />Select Season</div>
        <div className="season-picker">
          {seasons.length === 0 ? (
            <button className="season-btn active current">Season 5 ★</button>
          ) : (
            seasons.map((s) => (
              <button
                key={s.id}
                className={`season-btn ${s.id === activeSeasonId ? "active" : ""} ${s.is_current ? "current" : ""}`}
                onClick={() => handleSeasonSelect(s.id)}
              >
                {s.title || `Season ${s.id}`} {s.is_current ? "★" : ""}
              </button>
            ))
          )}
        </div>

        <div className="launcher-tabs">
          {Object.entries(LAUNCHER_LABELS).map(([key, label]) => (
            <button
              key={key}
              className={`launcher-tab ${activeLauncher === key ? "active" : ""}`}
              onClick={() => setActiveLauncher(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="launcher-content">
          {activeSeason ? (
            <div
              dangerouslySetInnerHTML={{
                __html: sanitizeSeasonHtml(
                  (activeSeason[activeLauncher as keyof Season] as string) ||
                    `<p>No ${LAUNCHER_LABELS[activeLauncher]} instructions for this season yet.</p>`
                ),
              }}
            />
          ) : (
            <p style={{ color: "var(--text-dim)" }}>No season data available.</p>
          )}
        </div>
      </div>

      {isAdmin && activeSeason && (
        <div className="card" id="seasonEditor">
          <div className="card__title"><span className="dot" />Admin: Edit Season</div>
          <div className="settings-form">
            <label className="settings-label">Title</label>
            <input className="settings-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            <label className="settings-label" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input type="checkbox" checked={editCurrent} onChange={(e) => setEditCurrent(e.target.checked)} />
              Current Season (will unset others)
            </label>
            {Object.entries(LAUNCHER_LABELS).map(([key, label]) => (
              <div key={key} className="season-launcher-edit">
                <label>{label} Instructions (HTML)</label>
                <textarea
                  value={editLaunchers[key] || ""}
                  onChange={(e) => setEditLaunchers((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={`Enter ${label} instructions...`}
                />
              </div>
            ))}
            <div className="admin-actions">
              <button
                className="admin-btn"
                onClick={async () => {
                  try {
                    await updateSeason(activeSeason.id, {
                      title: editTitle,
                      is_current: editCurrent,
                      prism: editLaunchers.prism || "",
                      sklauncher: editLaunchers.sklauncher || "",
                      modrinth: editLaunchers.modrinth || "",
                      curseforge: editLaunchers.curseforge || "",
                    });
                    showToast("Season saved!", "success");
                    loadData();
                  } catch {
                    showToast("Failed to save season.", "error");
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
