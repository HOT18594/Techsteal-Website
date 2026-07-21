"use client";

import { useState, useEffect } from "react";
import { fetchServerStatus, controlServer, DISCORD_INVITE_API, DISCORD_WIDGET_API, DISCORD_GUILD_ID, SERVER_ADDRESS, copyToClipboard } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/Toast";

export default function Home() {
  const [serverData, setServerData] = useState<any>(null);
  const [discordData, setDiscordData] = useState<any>({ name: "Techsteal - Season V", online: "—", members: "—", icon: null });
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [controlling, setControlling] = useState<"start" | "stop" | null>(null);
  const [unlockCode, setUnlockCode] = useState("");
  const [showUnlock, setShowUnlock] = useState(false);
  const { user } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    refreshServerStatus();
    loadDiscord();
    const timer = setInterval(refreshServerStatus, 60000);
    return () => clearInterval(timer);
  }, []);

  const refreshServerStatus = async () => {
    setRefreshing(true);
    try {
      const data = await fetchServerStatus();
      setServerData(data);
      return data;
    } catch {
      // keep previous data, but ensure loading is cleared
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleServerAction = async (action: "start" | "stop") => {
    if (controlling) return;
    setControlling(action);
    const res = await controlServer(action, unlockCode || undefined);
    if (res.ok) {
      showToast(action === "start" ? "Server start requested!" : "Server stop requested!", "success");
      // Refresh after a short delay
      setTimeout(() => refreshServerStatus(), 2000);
    } else {
      showToast(res.error || `Failed to ${action} server`, "error");
    }
    setControlling(null);
  };

  const handleCopyIp = async () => {
    try {
      await copyToClipboard(SERVER_ADDRESS);
      showToast("IP copied!", "success");
    } catch {
      showToast("Failed to copy IP", "error");
    }
  };

  const loadDiscord = async () => {
    try {
      const res = await fetch(DISCORD_INVITE_API);
      if (res.ok) {
        const data = await res.json();
        const guild = data.guild || {};
        setDiscordData({
          name: guild.name || "Techsteal - Season V",
          online: data.approximate_presence_count ?? "—",
          members: data.approximate_member_count ?? "—",
          icon: guild.icon || null,
        });
      }
    } catch {}
    try {
      const wRes = await fetch(DISCORD_WIDGET_API);
      if (wRes.ok) {
        const wData = await wRes.json();
        setMembers(wData.members || []);
      }
    } catch {}
  };

  const online = Boolean(serverData?.online);
  const players = online && serverData?.players ? serverData.players : null;
  const canControl = user?.inGuild;
  const isAdmin = user?.role === "admin";

  return (
    <div className="home-grid">
      <div className="card">
        <div className="card__title">Season V Server Status</div>
        {loading ? (
          <div className="status-spinner-wrapper">
            <div className="status-spinner" />
            <span>Checking server...</span>
          </div>
        ) : (
          <>
            <div className="server-dashboard">
              <div className="server-dashboard__card server-dashboard__card--status">
                <div className="server-dashboard__label">Status</div>
                <div className="server-dashboard__status">
                  <span className={`server-dashboard__dot ${online ? "" : "offline"}`} />
                  <span className="server-dashboard__value">{online ? "Online" : "Offline"}</span>
                </div>
                <span className="server-dashboard__hint">
                  {online ? "Join with the IP below" : "Start it from in-game after joining"}
                </span>
              </div>
              <div className="server-dashboard__card">
                <div className="server-dashboard__label">Players</div>
                <div className="server-dashboard__value">
                  {players ? (players.max > 0 ? `${players.online ?? 0} / ${players.max}` : `${players.online ?? 0}`) : "—"}
                </div>
              </div>
              <div className="server-dashboard__card">
                <div className="server-dashboard__label">Version</div>
                <div className="server-dashboard__value">{online ? (serverData.version || "—") : "—"}</div>
              </div>
              <div className="server-dashboard__card server-dashboard__card--address">
                <div className="server-dashboard__label">Address</div>
                <div className="server-dashboard__address-value">
                  <span className="server-dashboard__value">{SERVER_ADDRESS}</span>
                </div>
                <button className="copy-btn" onClick={handleCopyIp}>
                  Copy
                </button>
              </div>
            </div>

            <div className="server-dashboard__actions">
              <button className="btn btn--ghost" onClick={refreshServerStatus} disabled={refreshing}>
                <span className={`btn__refresh-icon ${refreshing ? "spinning" : ""}`}>↻</span>
                {refreshing ? "Checking…" : "Refresh"}
              </button>
              <a
                className="server-join"
                href={`https://discord.gg/${DISCORD_INVITE_API.split("/invites/")[1]?.split("?")[0] || "bEZ5M5jBvz"}`}
                target="_blank"
                rel="noopener"
              >
                Join Discord to play
              </a>
            </div>

            {/* Server controls - gated by inGuild, stop restricted to admin in API */}
            <div className="server-dashboard__actions" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #2a3236" }}>
              {canControl ? (
                <div className="server-dashboard__actions-group">
                  <button
                    className="btn btn--start"
                    onClick={() => handleServerAction("start")}
                    disabled={!!controlling || online}
                    title={online ? "Server is already online" : "Start the server"}
                  >
                    {controlling === "start" ? "Starting…" : "Start Server"}
                  </button>
                  {isAdmin && (
                    <button
                      className="btn btn--stop"
                      onClick={() => handleServerAction("stop")}
                      disabled={!!controlling || !online}
                      title={!online ? "Server is offline" : "Stop the server (admin only)"}
                    >
                      {controlling === "stop" ? "Stopping…" : "Stop Server"}
                    </button>
                  )}
                  {!isAdmin && (
                    <span style={{ fontSize: 12, color: "var(--text-dim)", alignSelf: "center" }}>
                      Stop restricted to admins
                    </span>
                  )}
                </div>
              ) : showUnlock ? (
                <div className="server-unlock">
                  <input
                    className="server-unlock__input"
                    type="password"
                    placeholder="Enter server control code…"
                    value={unlockCode}
                    onChange={(e) => setUnlockCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleServerAction("start")}
                  />
                  <button
                    className="btn btn--start"
                    onClick={() => handleServerAction("start")}
                    disabled={!!controlling || online || !unlockCode.trim()}
                    title={online ? "Server is already online" : unlockCode.trim() ? "Start the server" : "Enter a code first"}
                  >
                    {controlling === "start" ? "Starting…" : "Start Server"}
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={() => { setShowUnlock(false); setUnlockCode(""); }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="server-locked-group">
                  <a
                    href="https://discord.gg/bEZ5M5jBvz"
                    target="_blank"
                    rel="noopener"
                    className="server-locked"
                    title="Join Discord to unlock server controls"
                  >
                    🔒 Join Discord to control server
                  </a>
                  <button
                    className="btn btn--ghost server-unlock-btn"
                    onClick={() => setShowUnlock(true)}
                    title="Use a server control code instead"
                  >
                    🔑 Unlock with code
                  </button>
                </div>
              )}
            </div>

            {refreshing && (
              <div className="server-dashboard__checking">
                <span className="status-spinner status-spinner--sm" />
                Checking server status…
              </div>
            )}
            {players?.list?.length > 0 && (
              <div style={{ marginTop: "16px" }}>
                <div className="server-dashboard__label" style={{ marginBottom: "8px" }}>Online Players</div>
                <div className="player-list">
                  {players.list.map((p: any, i: number) => {
                    const name = typeof p === "string" ? p : (p.name || p.uuid || "Player");
                    const uuid = typeof p === "object" ? p.uuid : null;
                    const headUrl = uuid ? `https://crafatar.com/avatars/${uuid}?size=32&overlay` : `https://mc-heads.net/avatar/${name}/32`;
                    return (
                      <div key={i} className="player-chip">
                        <img className="player-chip__head" src={headUrl} alt={name} loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
                        <span>{name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card discord-card">
        <div className="card__title">Discord Community</div>
        <div className="discord-widget">
          <div className="discord-widget__header">
            <div className="discord-widget__icon">
              {discordData.icon ? (
                <img src={`https://cdn.discordapp.com/icons/${DISCORD_GUILD_ID}/${discordData.icon}.png?size=128`} alt="" />
              ) : (
                <span className="discord-widget__icon-placeholder">💬</span>
              )}
            </div>
            <div className="discord-widget__info">
              <div className="discord-widget__name">{discordData.name}</div>
              <div className="discord-widget__stats">
                <span className="discord-stat"><span className="discord-stat__dot discord-stat__dot--online" />{discordData.online} online</span>
                <span className="discord-stat"><span className="discord-stat__dot discord-stat__dot--members" />{discordData.members} members</span>
              </div>
            </div>
          </div>
          <a href="https://discord.gg/bEZ5M5jBvz" target="_blank" rel="noopener" className="btn btn--discord" style={{ marginBottom: "16px" }}>
            Join Discord
          </a>
          <div className="discord-online-list">
            <div className="discord-online-list__title">Online Now</div>
            <div className="discord-online-list__body">
              {members.length === 0 ? (
                <div className="discord-empty">No members online right now.</div>
              ) : (
                members.map((m: any, i: number) => {
                  const avatar = m.avatar_url || (m.avatar ? `https://cdn.discordapp.com/avatars/${m.id}/${m.avatar}.png?size=32` : `https://cdn.discordapp.com/embed/avatars/${Number(m.discriminator || 0) % 5}.png`);
                  return (
                    <div key={i} className="discord-member">
                      <img className="discord-member__avatar" src={avatar} alt="" onError={(e) => (e.currentTarget.src = "https://cdn.discordapp.com/embed/avatars/0.png")} />
                      <span className="discord-member__name">{m.username}</span>
                      {m.game && <span className="discord-member__game">{m.game.name}</span>}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
