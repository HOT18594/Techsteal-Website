/* ============================================================
   TechSteal — Season 5 Website
   App logic: login, routing, server status, posts, blog
   All data in localStorage/sessionStorage (browser cache)
   Server status via api.mcsrvstat.us (free, public, CORS)
   Discord via official widget iframe (always works on static sites)
   ============================================================ */

const MEMBER_CODE = "123456";
const ADMIN_CODE  = "654321";
const STORAGE_KEYS = {
  auth: "ts_auth", user: "ts_user", role: "ts_role",
  posts: "ts_posts", pfp: "ts_pfp", blog: "ts_blog_posts"
};
const SERVER_ADDRESS = "play.techsteal.space";
const STATUS_API = `https://api.mcsrvstat.us/3/${SERVER_ADDRESS}`;
const STATUS_API_FALLBACK = `https://api.mcsrvstat.us/2/${SERVER_ADDRESS}`;
const CURRENT_SEASON_ID = 5;

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/* ============================================================
   TOAST — properly hidden, never stuck
   ============================================================ */
let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  // Make it visible first
  t.style.display = "block";
  t.textContent = msg;
  // Force reflow so transition works
  void t.offsetHeight;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove("show");
    // Hide completely after transition
    setTimeout(() => { t.style.display = "none"; }, 350);
  }, 2600);
}

/* ============================================================
   LOGIN
   ============================================================ */
function initLogin() {
  const splash = $("#splash");
  const app = $("#app");
  if (!splash || !app) return;

  if (sessionStorage.getItem(STORAGE_KEYS.auth) === "1") {
    splash.style.display = "none";
    app.classList.add("show");
    promptForUsername();
    return;
  }

  const form = $("#loginForm");
  const input = $("#keyInput");
  const error = $("#loginError");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = input.value.trim();
    let role = null;
    if (val === MEMBER_CODE) role = "member";
    else if (val === ADMIN_CODE) role = "admin";
    if (!role) {
      error.textContent = "Invalid code. Try again.";
      error.classList.add("show");
      input.value = "";
      input.focus();
      return;
    }
    sessionStorage.setItem(STORAGE_KEYS.auth, "1");
    localStorage.setItem(STORAGE_KEYS.role, role);
    error.classList.remove("show");
    splash.style.transition = "opacity .4s ease";
    splash.style.opacity = "0";
    setTimeout(() => {
      splash.style.display = "none";
      app.classList.add("show");
      promptForUsername();
      toast(role === "admin" ? "Welcome Admin" : "Welcome Member");
    }, 400);
  });
}

/* ============================================================
   USERNAME MODAL — properly closes
   ============================================================ */
function openUsernameModal() {
  const overlay = $("#usernameModal");
  const input = $("#usernameModalInput");
  const saveBtn = $("#usernameModalSave");
  const skipBtn = $("#usernameModalSkip");
  if (!overlay || !input || !saveBtn || !skipBtn) return;

  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  input.value = localStorage.getItem(STORAGE_KEYS.user) || "";
  input.focus();

  // Clean up any previous listeners by cloning
  const newSave = saveBtn.cloneNode(true);
  const newSkip = skipBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSave, saveBtn);
  skipBtn.parentNode.replaceChild(newSkip, skipBtn);

  const finish = () => {
    const value = input.value.trim();
    const clean = value || "Guest";
    localStorage.setItem(STORAGE_KEYS.user, clean);
    updateProfileLabel();
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    toast(value ? `Profile saved for ${clean}` : "Using guest profile.");
  };

  newSave.addEventListener("click", finish);
  newSkip.addEventListener("click", () => {
    localStorage.setItem(STORAGE_KEYS.user, "Guest");
    updateProfileLabel();
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    toast("Using guest profile.");
  });

  input.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); finish(); } };
}

function promptForUsername() {
  if (localStorage.getItem(STORAGE_KEYS.user)) { updateProfileLabel(); return; }
  openUsernameModal();
}

function updateProfileLabel() {
  const label = $("#profileLabel");
  const role = localStorage.getItem(STORAGE_KEYS.role) || "member";
  const user = localStorage.getItem(STORAGE_KEYS.user) || "Guest";
  if (label) label.textContent = `${user} • ${role === "admin" ? "Admin" : "Member"}`;
  const roleDisplay = $("#settingsRoleDisplay");
  if (roleDisplay) roleDisplay.textContent = `Role: ${role === "admin" ? "Admin" : "Member"}`;
  renderAvatar();
}

function renderAvatar() {
  const avatarContainer = $("#sidebarAvatar");
  const pfp = localStorage.getItem(STORAGE_KEYS.pfp);
  if (!avatarContainer) return;
  avatarContainer.innerHTML = "";
  if (pfp) {
    const img = document.createElement("img");
    img.src = pfp; img.alt = "Profile";
    avatarContainer.appendChild(img);
    avatarContainer.classList.add("show");
  } else {
    avatarContainer.classList.remove("show");
  }
}

function logout() {
  sessionStorage.removeItem(STORAGE_KEYS.auth);
  location.reload();
}

/* ============================================================
   NAVIGATION
   ============================================================ */
const PAGES = ["home", "join", "community", "blog", "settings"];
const TITLES = { home: "Home", join: "How to Join", community: "Community", blog: "Blog", settings: "Settings" };

function navigate(page) {
  if (!PAGES.includes(page)) page = "home";
  $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.page === page));
  $$(".page").forEach((p) => p.classList.toggle("active", p.id === `page-${page}`));
  const title = $("#topbarTitle");
  if (title) title.textContent = TITLES[page];
  $(".sidebar")?.classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function initNav() {
  $$(".nav-item").forEach((n) => n.addEventListener("click", () => navigate(n.dataset.page)));
  $("#logoutBtn")?.addEventListener("click", logout);
  $("#logoutBtn2")?.addEventListener("click", logout);
  $(".menu-toggle")?.addEventListener("click", () => $(".sidebar")?.classList.toggle("open"));
}

/* ============================================================
   SERVER STATUS (mcsrvstat.us)
   ============================================================ */
let serverRefreshTimer = null;

async function fetchServerStatus() {
  try {
    const res = await fetch(STATUS_API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    try {
      const res2 = await fetch(STATUS_API_FALLBACK);
      if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
      return await res2.json();
    } catch { return null; }
  }
}

async function refreshServerStatus() {
  const spinner = $("#statusSpinner");
  if (spinner) spinner.style.display = "flex";
  const data = await fetchServerStatus();
  if (spinner) spinner.style.display = "none";
  const online = Boolean(data?.online);

  const topDot = $("#statusDot");
  const topText = $("#statusText");
  if (topDot) topDot.classList.toggle("off", !online);
  if (topText) topText.textContent = online ? "Online" : "Offline";

  const dotEl = $("#serverStatusDot");
  const statusEl = $("#serverStatusText");
  const playersEl = $("#serverPlayers");
  const addressEl = $("#serverAddress");
  const versionEl = $("#serverVersion");

  if (dotEl) dotEl.classList.toggle("offline", !online);
  if (statusEl) statusEl.textContent = online ? "Online" : "Offline";

  if (playersEl) {
    if (online && data.players) {
      const on = data.players.online ?? 0;
      const max = data.players.max ?? 0;
      playersEl.textContent = max > 0 ? `${on} / ${max}` : `${on}`;
    } else { playersEl.textContent = "—"; }
  }
  if (addressEl) addressEl.textContent = data?.hostname || SERVER_ADDRESS;
  if (versionEl) versionEl.textContent = online ? (data.version || "—") : "—";
  $$("[data-server-ip]").forEach((el) => { el.textContent = SERVER_ADDRESS; });

  // Player list
  const wrapper = $("#playerListWrapper");
  const list = $("#playerList");
  if (wrapper && list) {
    const players = online ? data?.players?.list : null;
    if (players && players.length) {
      wrapper.style.display = "block";
      list.innerHTML = players.map((p) => {
        const name = typeof p === "string" ? p : (p.name || p.uuid || "Player");
        const uuid = typeof p === "object" ? p.uuid : null;
        const headUrl = uuid
          ? `https://crafatar.com/avatars/${uuid}?size=32&overlay`
          : `https://mc-heads.net/avatar/${name}/32`;
        return `<div class="player-chip"><img class="player-chip__head" src="${headUrl}" alt="${name}" loading="lazy" onerror="this.style.display='none'" /><span>${name}</span></div>`;
      }).join("");
    } else { wrapper.style.display = "none"; }
  }

  // MOTD
  const motdCard = $("#motdCard");
  const motdBody = $("#motdBody");
  if (motdCard && motdBody) {
    const motd = online ? data?.motd : null;
    if (motd) {
      const text = Array.isArray(motd.clean) ? motd.clean.join("\n") : (motd.clean || motd.raw || "");
      if (text.trim()) { motdCard.style.display = "block"; motdBody.textContent = text; }
      else { motdCard.style.display = "none"; }
    } else { motdCard.style.display = "none"; }
  }
}

function initServerStatus() {
  refreshServerStatus();
  $("#btnRefresh")?.addEventListener("click", refreshServerStatus);
  if (serverRefreshTimer) clearInterval(serverRefreshTimer);
  serverRefreshTimer = setInterval(refreshServerStatus, 60000);
}

/* ============================================================
   DISCORD WIDGET — invite API for counts + widget API for members
   ============================================================ */
async function loadDiscordWidget() {
  // 1) Fetch invite data for guild name, icon, total counts
  let guildName = "Techsteal - Season V";
  let guildIcon = null;
  let onlineCount = "—";
  let memberCount = "—";

  try {
    const res = await fetch(DISCORD_INVITE_API);
    if (res.ok) {
      const data = await res.json();
      const guild = data.guild || {};
      guildName = guild.name || guildName;
      guildIcon = guild.icon || null;
      onlineCount = data.approximate_presence_count ?? "—";
      memberCount = data.approximate_member_count ?? "—";
    }
  } catch { /* invite API failed, use defaults */ }

  // Update header
  const nameEl = $("#discordName");
  const onlineEl = $("#discordOnline");
  const membersEl = $("#discordMembers");
  const iconEl = $("#discordIcon");
  const placeholderEl = $("#discordIconPlaceholder");

  if (nameEl) nameEl.textContent = guildName;
  if (onlineEl) onlineEl.textContent = onlineCount;
  if (membersEl) membersEl.textContent = memberCount;

  if (guildIcon && iconEl && placeholderEl) {
    iconEl.src = `https://cdn.discordapp.com/icons/${DISCORD_GUILD_ID}/${guildIcon}.png?size=128`;
    iconEl.style.display = "block";
    placeholderEl.style.display = "none";
  }

  // 2) Fetch widget data for online member list
  const listBody = $("#discordOnlineListBody");
  if (!listBody) return;

  try {
    const wRes = await fetch(DISCORD_WIDGET_API);
    if (!wRes.ok) throw new Error(`HTTP ${wRes.status}`);
    const wData = await wRes.json();
    const members = wData.members || [];

    if (!members.length) {
      listBody.innerHTML = '<div class="discord-empty">No members online right now.</div>';
    } else {
      listBody.innerHTML = members.map((m) => {
        const avatar = m.avatar_url
          ? m.avatar_url
          : m.avatar
            ? `https://cdn.discordapp.com/avatars/${m.id}/${m.avatar}.png?size=32`
            : `https://cdn.discordapp.com/embed/avatars/${Number(m.discriminator || 0) % 5}.png`;
        const game = m.game ? `<span class="discord-member__game">${escapeHtml(m.game.name)}</span>` : "";
        return `<div class="discord-member"><img class="discord-member__avatar" src="${avatar}" alt="" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" /><span class="discord-member__name">${escapeHtml(m.username)}</span>${game}</div>`;
      }).join("");
    }
  } catch {
    listBody.innerHTML = `<div class="discord-empty">Enable "Server Widget" in Discord settings to see online members.<br><a href="https://discord.gg/bEZ5M5jBvz" target="_blank" rel="noopener">Join Discord here</a></div>`;
  }
}

function escapeHtml(str) {
  const tmp = document.createElement("div");
  tmp.textContent = str;
  return tmp.innerHTML;
}

/* ============================================================
   COPY IP
   ============================================================ */
function initCopyIP() {
  const copyIPs = [
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
        ta.value = ip; document.body.appendChild(ta);
        ta.select(); document.execCommand("copy");
        document.body.removeChild(ta);
        toast("IP copied to clipboard!");
      }
    });
  });
}

/* ============================================================
   SEASONS
   ============================================================ */
let seasonData = [];
let activeSeasonId = CURRENT_SEASON_ID;

async function loadSeasons() {
  try {
    const res = await fetch("data/seasons.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    seasonData = data.seasons || [];
    if (!seasonData.length) return;
    activeSeasonId = CURRENT_SEASON_ID;
    renderSeasonPicker();
  } catch {
    seasonData = [];
    renderSeasonPicker();
  }
}

function renderSeasonPicker() {
  const picker = $("#seasonPicker");
  if (!picker) return;
  if (!seasonData.length) {
    picker.innerHTML = '<button class="season-btn active current">Season 5 ★</button>';
  } else {
    picker.innerHTML = seasonData.map((s) =>
      `<button class="season-btn ${s.id === activeSeasonId ? "active" : ""} ${s.id === CURRENT_SEASON_ID ? "current" : ""}" data-season="${s.id}">${s.title}</button>`
    ).join("");
  }
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

/* ============================================================
   COMMUNITY POSTS
   ============================================================ */
function stripHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

function initEditorToolbar(editor) {
  if (!editor) return;
  const toolbar = editor.closest(".editor");
  if (!toolbar) return;
  toolbar.querySelectorAll(".editor__btn").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.preventDefault();
      const cmd = button.getAttribute("data-cmd");
      const val = button.getAttribute("data-value") || null;
      if (!cmd) return;
      editor.focus();
      document.execCommand(cmd, false, val);
      if (cmd === "insertUnorderedList" || cmd === "insertOrderedList") {
        setTimeout(() => editor.focus(), 0);
      }
      if (["bold", "italic", "underline"].includes(cmd)) {
        button.classList.toggle("active", document.queryCommandState(cmd));
      }
    });
  });
}

function initCommunityPosts() {
  const form = $("#newPostForm");
  const editor = $("#communityEditor");
  if (!form || !editor) return;
  initEditorToolbar(editor);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const body = editor.innerHTML.trim();
    if (!stripHtml(body)) { toast("Please write something before posting."); return; }
    const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.posts) || "[]");
    posts.unshift({
      id: `local_${Date.now()}`,
      author: localStorage.getItem(STORAGE_KEYS.user) || "Guest",
      body, pfp: localStorage.getItem(STORAGE_KEYS.pfp) || "",
      created_at: new Date().toISOString()
    });
    localStorage.setItem(STORAGE_KEYS.posts, JSON.stringify(posts));
    editor.innerHTML = "";
    renderPosts();
    toast("Post published!");
  });
}

function renderPosts() {
  const list = $("#postList");
  if (!list) return;
  const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.posts) || "[]");
  if (!posts.length) {
    list.innerHTML = '<div class="empty-state">No posts yet. Be the first to share something!</div>';
    return;
  }
  list.innerHTML = posts.map((post) => `
    <div class="post">
      <div class="post__head">
        <div class="avatar">${post.pfp ? `<img src="${post.pfp}" alt="avatar" />` : (post.author || "A").charAt(0).toUpperCase()}</div>
        <div>
          <div class="post__author">${post.author || "Guest"}</div>
          <div class="post__time">${new Date(post.created_at).toLocaleString()}</div>
        </div>
      </div>
      <div class="post__body">${post.body}</div>
    </div>
  `).join("");
}

/* ============================================================
   BLOG
   ============================================================ */
function initBlogPosts() {
  const form = $("#newBlogPostForm");
  const titleInput = $("#blogTitleInput");
  const editor = $("#blogEditor");
  const composerCard = $("#blogComposerCard");
  initEditorToolbar(editor);
  if (composerCard && localStorage.getItem(STORAGE_KEYS.role) === "admin") {
    composerCard.style.display = "block";
  }
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = titleInput?.value.trim() || "Untitled";
    const body = editor?.innerHTML.trim() || "";
    if (!stripHtml(body)) { toast("Please write something before publishing."); return; }
    const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.blog) || "[]");
    posts.unshift({
      title, body,
      author: localStorage.getItem(STORAGE_KEYS.user) || "Admin",
      created_at: new Date().toISOString()
    });
    localStorage.setItem(STORAGE_KEYS.blog, JSON.stringify(posts));
    renderBlogPosts(posts);
    if (titleInput) titleInput.value = "";
    if (editor) editor.innerHTML = "";
    toast("Blog post published!");
  });
  renderBlogPosts(JSON.parse(localStorage.getItem(STORAGE_KEYS.blog) || "[]"));
}

function renderBlogPosts(posts) {
  const grid = $("#blogGrid");
  if (!grid) return;
  if (!posts.length) {
    grid.innerHTML = '<div class="empty-state">No blog posts yet. Check back soon!</div>';
    return;
  }
  grid.innerHTML = posts.map((post, i) => `
    <article class="blog-card" data-index="${i}">
      <div class="blog-card__banner"><span style="font-size:2rem;">📰</span></div>
      <div class="blog-card__body">
        <span class="blog-card__tag">News</span>
        <h3 class="blog-card__title">${post.title || "Untitled"}</h3>
        <p class="blog-card__excerpt">${stripHtml(post.body || "").slice(0, 120)}${stripHtml(post.body || "").length >= 120 ? "…" : ""}</p>
        <div class="blog-card__meta">by ${post.author || "Admin"} · ${new Date(post.created_at).toLocaleDateString()}</div>
      </div>
    </article>
  `).join("");
  $$(".blog-card").forEach((card) => {
    card.addEventListener("click", () => {
      const idx = Number(card.dataset.index);
      openBlogViewer(posts[idx]);
    });
  });
}

function openBlogViewer(post) {
  const overlay = $("#viewerOverlay");
  const content = $("#viewerContent");
  if (!overlay || !content) return;
  content.innerHTML = `
    <div class="viewer__title">${post.title || "Untitled"}</div>
    <div class="viewer__meta">by ${post.author || "Admin"} · ${new Date(post.created_at).toLocaleDateString()}</div>
    <div class="viewer__body">${post.body || ""}</div>
  `;
  overlay.classList.add("open");
}

function initViewer() {
  $("#viewerClose")?.addEventListener("click", () => $("#viewerOverlay")?.classList.remove("open"));
  $("#viewerOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "viewerOverlay") e.target.classList.remove("open");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $("#viewerOverlay")?.classList.remove("open");
      $("#usernameModal")?.classList.remove("open");
    }
  });
}

/* ============================================================
   SETTINGS — drag & drop profile picture
   ============================================================ */
function initSettings() {
  const form = $("#settingsForm");
  const usernameInput = $("#settingsUsername");
  const pfpInput = $("#settingsPfpInput");
  const dropzone = $("#pfpDropzone");
  const preview = $("#settingsPfpPreview");
  const clearBtn = $("#clearPfpBtn");
  if (!form || !usernameInput || !dropzone) return;

  usernameInput.value = localStorage.getItem(STORAGE_KEYS.user) || "";
  updateDropzonePreview();

  function updateDropzonePreview() {
    const currentPfp = localStorage.getItem(STORAGE_KEYS.pfp);
    if (currentPfp) {
      preview.innerHTML = `<img src="${currentPfp}" alt="profile preview" /><div class="dz-text"><span>Click or drag to change</span></div>`;
    } else {
      preview.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px;color:var(--text-dim);"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span>Drag &amp; drop or click to upload</span>
      `;
    }
  }

  function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) { toast("Please upload an image file."); return; }
    if (file.size > 2 * 1024 * 1024) { toast("Image too large (max 2MB)."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      localStorage.setItem(STORAGE_KEYS.pfp, reader.result);
      updateDropzonePreview();
      renderAvatar();
      toast("Profile picture updated.");
    };
    reader.readAsDataURL(file);
  }

  dropzone.addEventListener("click", () => pfpInput?.click());
  pfpInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  });

  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  clearBtn?.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.pfp);
    updateDropzonePreview();
    renderAvatar();
    toast("Profile picture removed.");
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = usernameInput.value.trim();
    if (!value) { toast("Please enter a username."); return; }
    localStorage.setItem(STORAGE_KEYS.user, value);
    updateProfileLabel();
    toast("Profile saved.");
  });
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  initLogin();
  initNav();
  initServerStatus();
  loadDiscordWidget();
  initCopyIP();
  initCommunityPosts();
  initBlogPosts();
  initSettings();
  loadSeasons();
  initViewer();
  renderPosts();
  updateProfileLabel();
  renderAvatar();
});
