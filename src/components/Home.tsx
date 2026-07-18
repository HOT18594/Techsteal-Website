"use client";

import { useState, useEffect } from "react";
import { fetchServerStatus, DISCORD_INVITE_API, DISCORD_WIDGET_API, DISCORD_GUILD_ID, SERVER_ADDRESS } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const [serverData, setServerData] = useState<any>(null);
  const [discordData, setDiscordData] = useState<any>({ name: "Techsteal - Season V", online: "—", members: "—", icon: null });
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Server controls are only unlocked for members of the TechSteal Discord.
  const canControlServer = Boolean(user?.inGuild);

  useEffect(() => {
    refreshServerStatus();
    loadDiscord();
    const timer = setInterval(refreshServerStatus, 60000);
    return () => clearInterval(timer);
  }, []);

  const refreshServerStatus = async () => {
    const data = await fetchServerStatus();
    setServerData(data);
    setLoading(false);
    return data;
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
  const [serverState, setServerState] = useState<"running" | "offline" | "starting" | "stopping">(
    online ? "running" : "offline"
  );
  const [controlBusy, setControlBusy] = useState(false);

  const controlServer = async (action: "start" | "stop") => {
    setControlBusy(true);
    setServerState(action === "start" ? "starting" : "stopping");
    try {
      const res = await fetch("/api/server/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");

      // Poll the server status until it reflects the requested state,
      // so the user sees live feedback instead of waiting blindly.
      const targetOnline = action === "start";
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const fresh = await refreshServerStatus();
        const nowOnline = Boolean(fresh?.online);
        if (nowOnline === targetOnline) {
          setServerState(targetOnline ? "running" : "offline");
          break;
        }
        if (i === 29) setServerState(targetOnline ? "running" : "offline");
      }
    } catch (e: any) {
      alert(e.message || "Could not control server");
      setServerState(online ? "running" : "offline");
    } finally {
      setControlBusy(false);
    }
  };

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
              <div className="server-dashboard__card">
                <div className="server-dashboard__label">Address</div>
                <div className="server-dashboard__address-value">
                  <span className="server-dashboard__value">{SERVER_ADDRESS}</span>
                </div>
              </div>
            </div>
            <div className="server-dashboard__actions">
              <div className="server-dashboard__actions-group">
                <button className="btn btn--start" onClick={() => navigator.clipboard.writeText(SERVER_ADDRESS).then(() => alert("IP copied!"))}>
                  Copy IP
                </button>
                <button className="btn btn--ghost" onClick={refreshServerStatus} disabled={loading}>
                  <span className={`btn__refresh-icon ${loading ? "spinning" : ""}`}>↻</span> Refresh
                </button>
              </div>
              <div className="server-dashboard__actions-group">
                {canControlServer ? (
                  <>
                    <button
                      className="btn btn--start"
                      disabled={controlBusy || serverState === "running" || serverState === "starting"}
                      onClick={() => controlServer("start")}
                    >
                      {serverState === "starting" ? "Starting…" : "Start Server"}
                    </button>
                    <button
                      className="btn btn--stop"
                      disabled={controlBusy || serverState === "offline" || serverState === "stopping"}
                      onClick={() => controlServer("stop")}
                    >
                      {serverState === "stopping" ? "Stopping…" : "Stop Server"}
                    </button>
                  </>
                ) : (
                  <a
                    className="server-locked"
                    href={`https://discord.gg/${DISCORD_INVITE_API.split("/invites/")[1]?.split("?")[0] || "bEZ5M5jBvz"}`}
                    target="_blank"
                    rel="noopener"
                  >
                    🔒 Join our Discord to unlock Start / Stop
                  </a>
                )}
              </div>
            </div>
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
