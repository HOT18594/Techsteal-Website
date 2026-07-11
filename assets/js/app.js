/* ============================================================
   TechSteal — Minecraft Server Website
   Static app logic (no backend, no Node.js)
   Uses api.mcsrvstat.us (free, public, CORS-enabled)
   ============================================================ */

/* ---- CONFIG ---- */
const SERVER_ADDRESS = "play.techsteal.net";
const STATUS_API = `https://api.mcsrvstat.us/3/${SERVER_ADDRESS}`;
const STATUS_API_FALLBACK = `https://api.mcsrvstat.us/2/${SERVER_ADDRESS}`;

/* ---- HELPERS ---- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---- NAVBAR ---- */
function initNav() {
  const toggle = $("#navToggle");
  const links = $("#navLinks");
  toggle?.addEventListener("click", () => links?.classList.toggle("open"));

  $$(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      links?.classList.remove("open");
      $$(".nav-link").forEach((l) => l.classList.remove("active"));
      if (link.getAttribute("href")?.startsWith("#")) link.classList.add("active");
    });
  });

  // Highlight nav on scroll
  const sections = ["home", "blog", "join"];
  window.addEventListener("scroll", () => {
    let current = "home";
    for (const id of sections) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= 120) current = id;
    }
    $$(".nav-link").forEach((l) => {
      const href = l.getAttribute("href");
      l.classList.toggle("active", href === `#${current}`);
    });
  });
}

/* ---- COPY IP ---- */
function initCopyIP() {
  const copyIPs = [
    { btn: "#heroCopyIP", target: "#heroIP" },
    { btn: "#copyIP", target: "#serverAddress" },
    { btn: "#joinCopyIP", target: null },
  ];

  copyIPs.forEach(({ btn, target }) => {
    $(btn)?.addEventListener("click", async () => {
      const ip = target ? $(target)?.textContent?.trim() : SERVER_ADDRESS;
      if (!ip) return;
      try {
        await navigator.clipboard.writeText(ip);
        toast("IP copied to clipboard!");
      } catch {
        const ta = document.createElement("textarea");
        ta.value = ip;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        toast("IP copied to clipboard!");
      }
    });
  });
}

/* ---- SERVER STATUS ---- */
let statusRefreshTimer = null;
let lastStatusData = null;

async function fetchServerStatus() {
  try {
    const res = await fetch(STATUS_API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    lastStatusData = data;
    return data;
  } catch {
    try {
      const res2 = await fetch(STATUS_API_FALLBACK);
      if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
      const data2 = await res2.json();
      lastStatusData = data2;
      return data2;
    } catch {
      return null;
    }
  }
}

function renderServerStatus(data) {
  const online = Boolean(data?.online);

  // Hero status
  const heroDot = $("#heroStatusDot");
  const heroText = $("#heroStatusText");
  if (heroDot) heroDot.classList.toggle("off", !online);
  if (heroText) heroText.textContent = online ? "Server Online" : "Server Offline";

  // Status grid
  const statusDot = $("#serverStatusDot");
  const statusText = $("#serverStatusText");
  const playersEl = $("#serverPlayers");
  const addressEl = $("#serverAddress");
  const versionEl = $("#serverVersion");

  if (statusDot) statusDot.classList.toggle("offline", !online);
  if (statusText) statusText.textContent = online ? "Online" : "Offline";

  if (playersEl) {
    if (online && data.players) {
      const online_count = data.players.online ?? 0;
      const max_count = data.players.max ?? 0;
      playersEl.textContent = max_count > 0 ? `${online_count} / ${max_count}` : `${online_count}`;
    } else {
      playersEl.textContent = "—";
    }
  }

  if (addressEl) addressEl.textContent = data?.hostname || SERVER_ADDRESS;
  if (versionEl) versionEl.textContent = online ? (data.version || "—") : "—";

  // Player list
  renderPlayerList(online ? data : null);

  // MOTD
  renderMOTD(online ? data : null);
}

function renderPlayerList(data) {
  const wrapper = $("#playerListWrapper");
  const list = $("#playerList");
  if (!wrapper || !list) return;

  const players = data?.players?.list;
  if (!players || !players.length) {
    wrapper.style.display = "none";
    return;
  }

  wrapper.style.display = "block";
  list.innerHTML = players.map((p) => {
    const name = typeof p === "string" ? p : (p.name || p.uuid || "Player");
    const uuid = typeof p === "object" ? p.uuid : null;
    const headUrl = uuid
      ? `https://crafatar.com/avatars/${uuid}?size=32&overlay`
      : `https://mc-heads.net/avatar/${name}/32`;
    return `<div class="player-chip"><img class="player-chip__head" src="${headUrl}" alt="${name}" loading="lazy" onerror="this.style.display='none'" /><span>${name}</span></div>`;
  }).join("");
}

function renderMOTD(data) {
  const card = $("#motdCard");
  const body = $("#motdBody");
  if (!card || !body) return;

  const motd = data?.motd;
  if (!motd) {
    card.style.display = "none";
    return;
  }

  const text = Array.isArray(motd.clean) ? motd.clean.join("\n") : (motd.clean || motd.raw || "");
  if (!text.trim()) {
    card.style.display = "none";
    return;
  }

  card.style.display = "block";
  body.textContent = text;
}

async function refreshServerStatus() {
  const data = await fetchServerStatus();
  renderServerStatus(data);
}

function initServerStatus() {
  refreshServerStatus();
  if (statusRefreshTimer) clearInterval(statusRefreshTimer);
  // Refresh every 60 seconds (mcsrvstat.us caches for ~60s)
  statusRefreshTimer = setInterval(refreshServerStatus, 60000);
}

/* ---- BLOG / ANNOUNCEMENTS ---- */
async function loadBlogPosts() {
  const grid = $("#blogGrid");
  if (!grid) return;

  try {
    const res = await fetch("data/blog.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const posts = data.posts || [];

    if (!posts.length) {
      grid.innerHTML = '<div class="empty-state">No posts yet. Check back soon!</div>';
      return;
    }

    grid.innerHTML = posts.map((post, i) => {
      const excerpt = stripHtml(post.body || "").slice(0, 120);
      const truncated = stripHtml(post.body || "").length >= 120 ? "…" : "";
      const emoji = post.emoji || "📰";
      const tag = post.tag || "News";
      const date = post.date ? formatDate(post.date) : "";
      return `
        <article class="blog-card" data-index="${i}">
          <div class="blog-card__banner"><span style="font-size:2rem;">${emoji}</span></div>
          <div class="blog-card__body">
            <span class="blog-card__tag">${tag}</span>
            <h3 class="blog-card__title">${escapeHtml(post.title || "Untitled")}</h3>
            <p class="blog-card__excerpt">${escapeHtml(excerpt)}${truncated}</p>
            <div class="blog-card__meta">${date ? `${date} · ` : ""}by ${escapeHtml(post.author || "TechSteal")}</div>
          </div>
        </article>`;
    }).join("");

    // Store for modal
    blogPosts = posts;

    // Click handlers
    $$(".blog-card").forEach((card) => {
      card.addEventListener("click", () => {
        const idx = Number(card.dataset.index);
        openBlogModal(posts[idx]);
      });
    });
  } catch {
    grid.innerHTML = '<div class="empty-state">Unable to load blog posts. Check back later.</div>';
  }
}

let blogPosts = [];

function openBlogModal(post) {
  const modal = $("#blogModal");
  if (!modal) return;

  $("#blogModalTag").textContent = post.tag || "News";
  $("#blogModalTitle").textContent = post.title || "Untitled";
  $("#blogModalMeta").textContent = post.date ? `${formatDate(post.date)} · by ${post.author || "TechSteal"}` : `by ${post.author || "TechSteal"}`;
  $("#blogModalBody").innerHTML = post.body || "";

  modal.classList.add("open");
}

function initBlogModal() {
  const modal = $("#blogModal");
  const close = $("#blogModalClose");
  close?.addEventListener("click", () => modal?.classList.remove("open"));
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("open");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") modal?.classList.remove("open");
  });
}

/* ---- SEASONS ---- */
let seasonData = [];
let activeSeasonId = null;

async function loadSeasons() {
  try {
    const res = await fetch("data/seasons.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    seasonData = data.seasons || [];
    if (!seasonData.length) return;

    activeSeasonId = seasonData[0].id;
    const wrapper = $("#seasonsWrapper");
    if (wrapper) wrapper.style.display = "block";

    renderSeasonPicker();
  } catch {
    // Seasons are optional — just hide
  }
}

function renderSeasonPicker() {
  const picker = $("#seasonPicker");
  if (!picker) return;

  picker.innerHTML = seasonData.map((s) =>
    `<button class="season-btn ${s.id === activeSeasonId ? "active" : ""}" data-season="${s.id}">${escapeHtml(s.title)}</button>`
  ).join("");

  $$(".season-btn", picker).forEach((btn) => {
    btn.addEventListener("click", () => {
      activeSeasonId = Number(btn.dataset.season);
      renderSeasonPicker();
    });
  });

  renderActiveSeason();
}

function renderActiveSeason() {
  const season = seasonData.find((s) => s.id === activeSeasonId) || seasonData[0];
  if (!season) return;
  const titleEl = $("#seasonTitle");
  const bodyEl = $("#seasonBody");
  if (titleEl) titleEl.textContent = season.title || "Season";
  if (bodyEl) bodyEl.innerHTML = season.body || "";
}

/* ---- UTILITIES ---- */
function stripHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

function escapeHtml(str) {
  const tmp = document.createElement("div");
  tmp.textContent = str;
  return tmp.innerHTML;
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

/* ---- INIT ---- */
document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initCopyIP();
  initServerStatus();
  loadBlogPosts();
  initBlogModal();
  loadSeasons();
});
