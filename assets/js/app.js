/* ============================================================
   TechSteal — Season 5 Website
   Full app: login, routing, server status, Discord, seasons,
   community posts with images/likes/comments/search/pagination,
   blog with admin edit/delete, Supabase sync, lightbox viewer
   ============================================================ */

const MEMBER_CODE = "123456";
const ADMIN_CODE  = "654321";
const STORAGE_KEYS = {
  auth: "ts_auth", user: "ts_user", role: "ts_role",
  posts: "ts_posts", pfp: "ts_pfp", blog: "ts_blog_posts",
  liked: "ts_liked_posts"
};
const SERVER_ADDRESS = "play.techsteal.space";
const STATUS_API = `https://api.mcsrvstat.us/3/${SERVER_ADDRESS}`;
const STATUS_API_FALLBACK = `https://api.mcsrvstat.us/2/${SERVER_ADDRESS}`;
const DISCORD_INVITE_API = `https://discord.com/api/v9/invites/bEZ5M5jBvz?with_counts=true`;
const DISCORD_GUILD_ID = "1349848075371413515";
const DISCORD_WIDGET_API = `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`;
const CURRENT_SEASON_ID = 5;
const POSTS_PER_PAGE = 6;
const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25MB

// ---- Supabase ----
const SUPABASE_URL = "https://ektdywbjcpidnuxtjllm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrdGR5d2JqY3BpZG51eHRqbGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NzIzNTcsImV4cCI6MjA5OTM0ODM1N30.Svxxxpz_saeeju5AER4Zi0LRr0W_UPJPXzzS7g4eQ78";
const SUPABASE_HEADERS = {
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json"
};

async function supabaseSelect(table, orderBy = "created_at", ascending = false) {
  const orderParam = ascending ? "asc" : "desc";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?order=${orderBy}.${orderParam}`, { headers: SUPABASE_HEADERS });
  if (!res.ok) throw new Error(`Supabase ${table} fetch failed: ${res.status}`);
  return await res.json();
}
async function supabaseInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST", headers: { ...SUPABASE_HEADERS, "Prefer": "return=representation" }, body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`Supabase ${table} insert failed: ${res.status}`);
  return await res.json();
}
async function supabaseUpdate(table, id, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH", headers: { ...SUPABASE_HEADERS, "Prefer": "return=representation" }, body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`Supabase ${table} update failed: ${res.status}`);
  return await res.json();
}
async function supabaseDelete(table, id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, { method: "DELETE", headers: SUPABASE_HEADERS });
  if (!res.ok) throw new Error(`Supabase ${table} delete failed: ${res.status}`);
}
async function supabaseUploadImage(file) {
  const ext = file.name.split('.').pop() || 'jpg';
  const fileName = `posts/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/uploads/${fileName}`, {
    method: "POST",
    headers: { ...SUPABASE_HEADERS, "Content-Type": file.type },
    body: file
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return `${SUPABASE_URL}/storage/v1/object/public/uploads/${fileName}`;
}

function isAdmin() { return localStorage.getItem(STORAGE_KEYS.role) === "admin"; }
function getLikedPosts() { return JSON.parse(localStorage.getItem(STORAGE_KEYS.liked) || "[]"); }
function toggleLikedPost(id) {
  const liked = getLikedPosts();
  const idx = liked.indexOf(id);
  if (idx >= 0) liked.splice(idx, 1);
  else liked.push(id);
  localStorage.setItem(STORAGE_KEYS.liked, JSON.stringify(liked));
  return idx < 0;
}

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function escapeHtml(str) {
  const tmp = document.createElement("div");
  tmp.textContent = str;
  return tmp.innerHTML;
}

function stripHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff/86400)}d ago`;
  return d.toLocaleDateString();
}

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.style.display = "block";
  t.textContent = msg;
  void t.offsetHeight;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove("show");
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
   USERNAME MODAL
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
  $("#blogComposerCard")?.style.setProperty("display", isAdmin() ? "block" : "none");
  $("#seasonEditor")?.style.setProperty("display", isAdmin() ? "block" : "none");
}

function renderAvatar() {
  const c = $("#sidebarAvatar");
  const pfp = localStorage.getItem(STORAGE_KEYS.pfp);
  if (!c) return;
  c.innerHTML = "";
  if (pfp) {
    const img = document.createElement("img");
    img.src = pfp; img.alt = "Profile";
    c.appendChild(img);
    c.classList.add("show");
  } else { c.classList.remove("show"); }
}

function logout() { sessionStorage.removeItem(STORAGE_KEYS.auth); location.reload(); }

/* ============================================================
   NAVIGATION
   ============================================================ */
const PAGES = ["home", "join", "community", "blog", "settings", "post-detail"];
const TITLES = { home: "Home", join: "How to Join", community: "Community", blog: "Blog", settings: "Settings", "post-detail": "Post" };

function navigate(page) {
  if (!PAGES.includes(page)) page = "home";
  $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.page === page));
  $$(".page").forEach((p) => p.classList.toggle("active", p.id === `page-${page}`));
  const title = $("#topbarTitle");
  if (title) title.textContent = TITLES[page] || "Home";
  $(".sidebar")?.classList.remove("open");
  // Show back button for post detail
  const backBtn = $("#backBtn");
  if (backBtn) backBtn.style.display = (page === "post-detail") ? "inline-flex" : "none";
  // Hide nav items highlight for post-detail
  if (page === "post-detail") {
    $$(".nav-item").forEach((n) => n.classList.remove("active"));
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function initNav() {
  $$(".nav-item").forEach((n) => n.addEventListener("click", () => navigate(n.dataset.page)));
  $("#logoutBtn")?.addEventListener("click", logout);
  $("#logoutBtn2")?.addEventListener("click", logout);
  $(".menu-toggle")?.addEventListener("click", () => $(".sidebar")?.classList.toggle("open"));
  $("#backBtn")?.addEventListener("click", () => navigate("community"));
}

/* ============================================================
   SERVER STATUS
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
  const topDot = $("#statusDot"), topText = $("#statusText");
  if (topDot) topDot.classList.toggle("off", !online);
  if (topText) topText.textContent = online ? "Online" : "Offline";
  const dotEl = $("#serverStatusDot"), statusEl = $("#serverStatusText");
  const playersEl = $("#serverPlayers"), addressEl = $("#serverAddress"), versionEl = $("#serverVersion");
  if (dotEl) dotEl.classList.toggle("offline", !online);
  if (statusEl) statusEl.textContent = online ? "Online" : "Offline";
  if (playersEl) {
    if (online && data.players) {
      const on = data.players.online ?? 0, max = data.players.max ?? 0;
      playersEl.textContent = max > 0 ? `${on} / ${max}` : `${on}`;
    } else { playersEl.textContent = "—"; }
  }
  if (addressEl) addressEl.textContent = data?.hostname || SERVER_ADDRESS;
  if (versionEl) versionEl.textContent = online ? (data.version || "—") : "—";
  $$("[data-server-ip]").forEach((el) => { el.textContent = SERVER_ADDRESS; });
  const wrapper = $("#playerListWrapper"), list = $("#playerList");
  if (wrapper && list) {
    const players = online ? data?.players?.list : null;
    if (players && players.length) {
      wrapper.style.display = "block";
      list.innerHTML = players.map((p) => {
        const name = typeof p === "string" ? p : (p.name || p.uuid || "Player");
        const uuid = typeof p === "object" ? p.uuid : null;
        const headUrl = uuid ? `https://crafatar.com/avatars/${uuid}?size=32&overlay` : `https://mc-heads.net/avatar/${name}/32`;
        return `<div class="player-chip"><img class="player-chip__head" src="${headUrl}" alt="${name}" loading="lazy" onerror="this.style.display='none'" /><span>${name}</span></div>`;
      }).join("");
    } else { wrapper.style.display = "none"; }
  }
  const motdCard = $("#motdCard"), motdBody = $("#motdBody");
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
   DISCORD WIDGET
   ============================================================ */
async function loadDiscordWidget() {
  let guildName = "Techsteal - Season V", guildIcon = null, onlineCount = "—", memberCount = "—";
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
  } catch {}
  const nameEl = $("#discordName"), onlineEl = $("#discordOnline"), membersEl = $("#discordMembers");
  const iconEl = $("#discordIcon"), placeholderEl = $("#discordIconPlaceholder");
  if (nameEl) nameEl.textContent = guildName;
  if (onlineEl) onlineEl.textContent = onlineCount;
  if (membersEl) membersEl.textContent = memberCount;
  if (guildIcon && iconEl && placeholderEl) {
    iconEl.src = `https://cdn.discordapp.com/icons/${DISCORD_GUILD_ID}/${guildIcon}.png?size=128`;
    iconEl.style.display = "block";
    placeholderEl.style.display = "none";
  }
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
        const avatar = m.avatar_url || (m.avatar ? `https://cdn.discordapp.com/avatars/${m.id}/${m.avatar}.png?size=32` : `https://cdn.discordapp.com/embed/avatars/${Number(m.discriminator || 0) % 5}.png`);
        const game = m.game ? `<span class="discord-member__game">${escapeHtml(m.game.name)}</span>` : "";
        return `<div class="discord-member"><img class="discord-member__avatar" src="${avatar}" alt="" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" /><span class="discord-member__name">${escapeHtml(m.username)}</span>${game}</div>`;
      }).join("");
    }
  } catch {
    listBody.innerHTML = `<div class="discord-empty">Enable "Server Widget" in Discord settings to see online members.<br><a href="https://discord.gg/bEZ5M5jBvz" target="_blank" rel="noopener">Join Discord here</a></div>`;
  }
}

/* ============================================================
   COPY IP
   ============================================================ */
function initCopyIP() {
  [{ btn: "#copyIP", target: "#serverAddress" }, { btn: "#joinCopyIP", target: null }].forEach(({ btn, target }) => {
    $(btn)?.addEventListener("click", async () => {
      const ip = target ? $(target)?.textContent?.trim() : SERVER_ADDRESS;
      if (!ip) return;
      try { await navigator.clipboard.writeText(ip); toast("IP copied!"); }
      catch {
        const ta = document.createElement("textarea"); ta.value = ip;
        document.body.appendChild(ta); ta.select(); document.execCommand("copy");
        document.body.removeChild(ta); toast("IP copied!");
      }
    });
  });
}

/* ============================================================
   SEASONS + LAUNCHER TABS
   ============================================================ */
let seasonData = [], activeSeasonId = CURRENT_SEASON_ID, activeLauncher = "prism";
const LAUNCHER_LABELS = { prism: "Prism", sklauncher: "SK Launcher", modrinth: "Modrinth", curseforge: "CurseForge" };

async function loadSeasons() {
  try {
    const data = await supabaseSelect("seasons", "id", false);
    seasonData = data || [];
    if (!seasonData.length) {
      const res = await fetch("data/seasons.json");
      if (res.ok) { const local = await res.json(); seasonData = local.seasons || []; }
    }
    const current = seasonData.find((s) => s.is_current);
    if (current) activeSeasonId = current.id;
    else if (seasonData.length) activeSeasonId = seasonData[0].id;
    renderSeasonPicker(); renderLauncherContent(); renderSeasonEditor();
  } catch {
    try {
      const res = await fetch("data/seasons.json");
      if (res.ok) { const local = await res.json(); seasonData = local.seasons || []; activeSeasonId = CURRENT_SEASON_ID; renderSeasonPicker(); renderLauncherContent(); renderSeasonEditor(); }
    } catch {}
  }
}

function renderSeasonPicker() {
  const picker = $("#seasonPicker");
  if (!picker) return;
  if (!seasonData.length) {
    picker.innerHTML = '<button class="season-btn active current">Season 5 ★</button>';
  } else {
    picker.innerHTML = seasonData.map((s) =>
      `<button class="season-btn ${s.id === activeSeasonId ? "active" : ""} ${s.is_current ? "current" : ""}" data-season="${s.id}">${s.title || "Season " + s.id}</button>`
    ).join("");
  }
  $$(".season-btn", picker).forEach((btn) => {
    btn.addEventListener("click", () => {
      activeSeasonId = Number(btn.dataset.season);
      renderSeasonPicker(); renderLauncherContent(); renderSeasonEditor();
    });
  });
}

function initLauncherTabs() {
  $$(".launcher-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      activeLauncher = tab.dataset.launcher;
      $$(".launcher-tab").forEach((t) => t.classList.toggle("active", t === tab));
      renderLauncherContent();
    });
  });
}

function renderLauncherContent() {
  const content = $("#launcherContent");
  if (!content) return;
  const season = seasonData.find((s) => s.id === activeSeasonId) || seasonData[0];
  if (!season) { content.innerHTML = '<p style="color:var(--text-dim);">No season data available.</p>'; return; }
  content.innerHTML = season[activeLauncher] || `<p>No ${LAUNCHER_LABELS[activeLauncher]} instructions for this season yet.</p>`;
}

function renderSeasonEditor() {
  if (!isAdmin()) return;
  const editor = $("#seasonEditor");
  if (!editor) return;
  editor.style.display = "block";
  const season = seasonData.find((s) => s.id === activeSeasonId) || seasonData[0];
  if (!season) return;
  const titleInput = $("#seasonEditTitle"), currentCheckbox = $("#seasonEditCurrent");
  if (titleInput) titleInput.value = season.title || "";
  if (currentCheckbox) currentCheckbox.checked = season.is_current || false;
  const launchersDiv = $("#seasonEditLaunchers");
  if (!launchersDiv) return;
  const launchers = ["prism", "sklauncher", "modrinth", "curseforge"];
  launchersDiv.innerHTML = launchers.map((l) => `
    <div class="season-launcher-edit">
      <label>${LAUNCHER_LABELS[l]} Instructions (HTML)</label>
      <textarea id="seasonEdit_${l}" placeholder="Enter ${LAUNCHER_LABELS[l]} instructions...">${escapeHtml(season[l] || "")}</textarea>
    </div>`).join("");
}

function initSeasonEditor() {
  $("#seasonSaveBtn")?.addEventListener("click", async () => {
    const season = seasonData.find((s) => s.id === activeSeasonId);
    if (!season) { toast("No season selected."); return; }
    const title = $("#seasonEditTitle")?.value?.trim() || season.title;
    const is_current = $("#seasonEditCurrent")?.checked || false;
    const data = { title, is_current };
    ["prism", "sklauncher", "modrinth", "curseforge"].forEach((l) => { data[l] = $(`#seasonEdit_${l}`)?.value || ""; });
    try {
      await supabaseUpdate("seasons", season.id, data);
      if (is_current) { for (const s of seasonData) { if (s.id !== season.id && s.is_current) await supabaseUpdate("seasons", s.id, { is_current: false }); } }
      toast("Season updated!"); await loadSeasons();
    } catch { toast("Failed to save season."); }
  });
  $("#seasonNewBtn")?.addEventListener("click", async () => {
    const nextId = Math.max(0, ...seasonData.map((s) => s.id)) + 1;
    try {
      await supabaseInsert("seasons", { id: nextId, title: `Season ${nextId}`, is_current: false, prism: "<p>New season instructions.</p>", sklauncher: "<p>New season instructions.</p>", modrinth: "<p>New season instructions.</p>", curseforge: "<p>New season instructions.</p>" });
      activeSeasonId = nextId; toast("New season created!"); await loadSeasons();
    } catch { toast("Failed to create season."); }
  });
  $("#seasonDeleteBtn")?.addEventListener("click", async () => {
    const season = seasonData.find((s) => s.id === activeSeasonId);
    if (!season) return;
    if (!confirm(`Delete "${season.title}"? This cannot be undone.`)) return;
    try { await supabaseDelete("seasons", season.id); toast("Season deleted!"); activeSeasonId = CURRENT_SEASON_ID; await loadSeasons(); }
    catch { toast("Failed to delete season."); }
  });
}

/* ============================================================
   COMMUNITY POSTS
   ============================================================ */
let allPosts = [], currentPage = 1, searchTerm = "", editingPostId = null;
let pendingImages = []; // array of {file, url, status}

function initEditorToolbar(editor) {
  if (!editor) return;
  const toolbar = editor.closest(".editor");
  if (!toolbar) return;
  toolbar.querySelectorAll(".editor__btn").forEach((button) => {
    if (button.id === "addImageBtn") return;
    button.addEventListener("click", (e) => {
      e.preventDefault();
      const cmd = button.getAttribute("data-cmd");
      const val = button.getAttribute("data-value") || null;
      if (!cmd) return;
      editor.focus();
      document.execCommand(cmd, false, val);
      if (cmd === "insertUnorderedList" || cmd === "insertOrderedList") setTimeout(() => editor.focus(), 0);
      if (["bold", "italic", "underline"].includes(cmd)) button.classList.toggle("active", document.queryCommandState(cmd));
    });
  });
}

function initCommunityPosts() {
  const form = $("#newPostForm");
  const editor = $("#communityEditor");
  if (!form || !editor) return;
  initEditorToolbar(editor);

  // Image upload button
  const addImageBtn = $("#addImageBtn");
  const imageInput = $("#postImageInput");
  addImageBtn?.addEventListener("click", () => imageInput?.click());
  imageInput?.addEventListener("change", (e) => {
    const files = [...(e.target.files || [])];
    files.forEach(handleImageUpload);
    e.target.value = "";
  });

  // Drag & drop images into editor
  const editorEl = editor.closest(".editor");
  editorEl?.addEventListener("dragover", (e) => { e.preventDefault(); editorEl.classList.add("dragover"); });
  editorEl?.addEventListener("dragleave", () => editorEl.classList.remove("dragover"));
  editorEl?.addEventListener("drop", (e) => {
    e.preventDefault();
    editorEl.classList.remove("dragover");
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith("image/"));
    files.forEach(handleImageUpload);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = editor.innerHTML.trim();
    if (!stripHtml(body) && pendingImages.length === 0) { toast("Write something or add an image first."); return; }
    const author = localStorage.getItem(STORAGE_KEYS.user) || "Guest";
    const pfp = localStorage.getItem(STORAGE_KEYS.pfp) || "";

    // Wait for all pending uploads
    const imageUrls = pendingImages.filter(p => p.url).map(p => p.url);
    const imagesJson = JSON.stringify(imageUrls);

    try {
      if (editingPostId) {
        await supabaseUpdate("posts", editingPostId, { body, images: imagesJson });
        editingPostId = null;
        resetComposer();
        toast("Post updated!");
      } else {
        await supabaseInsert("posts", { author, body, pfp, images: imagesJson });
        resetComposer();
        toast("Post published!");
      }
      await loadPosts();
    } catch {
      toast("Failed to save post. Try again.");
    }
  });

  // Cancel edit
  $("#cancelEditBtn")?.addEventListener("click", () => {
    editingPostId = null;
    resetComposer();
  });

  // Search
  $("#postSearch")?.addEventListener("input", (e) => {
    searchTerm = e.target.value.toLowerCase().trim();
    currentPage = 1;
    renderPostList();
  });
}

function resetComposer() {
  const editor = $("#communityEditor");
  if (editor) editor.innerHTML = "";
  pendingImages = [];
  renderImagePreviews();
  $("#composerTitle").textContent = "Create Post";
  $("#composerBadge").style.display = "none";
  $("#postSubmitBtn").textContent = "Post";
  $("#cancelEditBtn").style.display = "none";
}

async function handleImageUpload(file) {
  if (!file.type.startsWith("image/")) { toast("Please upload an image file."); return; }
  if (file.size > MAX_IMAGE_SIZE) { toast(`Image too large (max 25MB). ${file.name}`); return; }
  const idx = pendingImages.length;
  pendingImages.push({ file, url: null, status: "uploading" });
  renderImagePreviews();
  try {
    const url = await supabaseUploadImage(file);
    pendingImages[idx].url = url;
    pendingImages[idx].status = "done";
    renderImagePreviews();
  } catch {
    pendingImages[idx].status = "error";
    renderImagePreviews();
    toast("Failed to upload image.");
  }
}

function renderImagePreviews() {
  const container = $("#imagePreviews");
  if (!container) return;
  container.innerHTML = pendingImages.map((p, i) => {
    if (p.status === "uploading") {
      return `<div class="image-thumb"><div class="image-thumb__uploading"><div class="status-spinner"></div></div></div>`;
    }
    const url = p.url || "";
    return `<div class="image-thumb"><img src="${url}" alt="preview" /><button class="image-thumb__remove" onclick="removePendingImage(${i})">&times;</button></div>`;
  }).join("");
}

function removePendingImage(idx) {
  pendingImages.splice(idx, 1);
  renderImagePreviews();
}
window.removePendingImage = removePendingImage;

async function loadPosts() {
  try {
    allPosts = await supabaseSelect("posts");
  } catch {
    allPosts = JSON.parse(localStorage.getItem(STORAGE_KEYS.posts) || "[]");
  }
  // Update stats
  const stats = $("#communityStats");
  if (stats) stats.textContent = `${allPosts.length} post${allPosts.length !== 1 ? "s" : ""}`;
  renderPostList();
}

function getFilteredPosts() {
  if (!searchTerm) return allPosts;
  return allPosts.filter(p => {
    const text = (stripHtml(p.body || "") + " " + (p.author || "")).toLowerCase();
    return text.includes(searchTerm);
  });
}

function renderPostList() {
  const list = $("#postList");
  if (!list) return;
  const filtered = getFilteredPosts();
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">${searchTerm ? "No posts match your search." : "No posts yet. Be the first to share something!"}</div>`;
    $("#pagination").innerHTML = "";
    return;
  }
  const totalPages = Math.ceil(filtered.length / POSTS_PER_PAGE);
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * POSTS_PER_PAGE;
  const pagePosts = filtered.slice(start, start + POSTS_PER_PAGE);

  list.innerHTML = pagePosts.map((post) => {
    const liked = getLikedPosts().includes(post.id);
    const images = parseImages(post.images);
    const imagesHtml = images.length ? renderPostImages(images, post.id) : "";
    const adminControls = isAdmin() ? `
      <div class="post-card__admin">
        <button class="admin-btn" onclick="event.stopPropagation();editPost(${post.id})">Edit</button>
        <button class="admin-btn danger" onclick="event.stopPropagation();deletePost(${post.id})">Delete</button>
      </div>` : "";
    return `
    <div class="post-card" onclick="openPostDetail(${post.id})">
      ${adminControls}
      <div class="post-card__head">
        <div class="post-card__avatar">${post.pfp ? `<img src="${post.pfp}" alt="avatar" />` : (post.author || "A").charAt(0).toUpperCase()}</div>
        <div class="post-card__meta">
          <div class="post-card__author">${post.author || "Guest"}</div>
          <div class="post-card__time">${timeAgo(post.created_at)}</div>
        </div>
      </div>
      <div class="post-card__body">${post.body || ""}</div>
      ${imagesHtml}
      <div class="post-card__footer">
        <span class="post-card__stat ${liked ? "liked" : ""}" onclick="event.stopPropagation();toggleLike(${post.id})">
          <svg viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span class="like-count-${post.id}">${post.likes || 0}</span>
        </span>
        <span class="post-card__stat" onclick="event.stopPropagation();openPostDetail(${post.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span class="comment-count-${post.id}">—</span>
        </span>
      </div>
    </div>`;
  }).join("");

  // Load comment counts
  pagePosts.forEach((post) => loadCommentCount(post.id));

  renderPagination(totalPages);
}

function parseImages(imagesJson) {
  if (!imagesJson) return [];
  try { return JSON.parse(imagesJson); } catch { return []; }
}

function renderPostImages(images, postId) {
  const count = images.length;
  if (!count) return "";
  const cls = `post-card__images--${Math.min(count, 4)}`;
  return `<div class="post-card__images ${cls}">${images.slice(0, 4).map((url, i) =>
    `<div class="post-card__image" onclick="event.stopPropagation();openLightbox(${JSON.stringify(images).replace(/"/g, '&quot;')}, ${i})"><img src="${url}" alt="" loading="lazy" /></div>`
  ).join("")}</div>`;
}

function renderPagination(totalPages) {
  const el = $("#pagination");
  if (!el || totalPages <= 1) { if (el) el.innerHTML = ""; return; }
  let html = "";
  // Prev
  html += `<button onclick="goToPage(${currentPage - 1})" ${currentPage <= 1 ? "disabled" : ""}>&#8249;</button>`;
  // Page numbers with ellipsis
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }
  pages.forEach((p) => {
    if (p === "...") html += `<span class="pagination__ellipsis">…</span>`;
    else html += `<button class="${p === currentPage ? "active" : ""}" onclick="goToPage(${p})">${p}</button>`;
  });
  // Next
  html += `<button onclick="goToPage(${currentPage + 1})" ${currentPage >= totalPages ? "disabled" : ""}>&#8250;</button>`;
  el.innerHTML = html;
}

function goToPage(page) {
  const totalPages = Math.ceil(getFilteredPosts().length / POSTS_PER_PAGE);
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderPostList();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
window.goToPage = goToPage;

async function toggleLike(postId) {
  const liked = toggleLikedPost(postId);
  try {
    const post = allPosts.find(p => p.id === postId);
    const newCount = (post.likes || 0) + (liked ? 1 : -1);
    await supabaseUpdate("posts", postId, { likes: Math.max(0, newCount) });
    if (post) post.likes = Math.max(0, newCount);
    // Update UI
    const countEl = $(`.like-count-${postId}`);
    if (countEl) countEl.textContent = Math.max(0, newCount);
    const statEl = countEl?.closest(".post-card__stat");
    statEl?.classList.toggle("liked", liked);
  } catch {
    // Revert on failure
    toggleLikedPost(postId);
    toast("Failed to like post.");
  }
}
window.toggleLike = toggleLike;

async function deletePost(id) {
  if (!isAdmin()) return;
  if (!confirm("Delete this post?")) return;
  try { await supabaseDelete("posts", id); toast("Post deleted!"); await loadPosts(); }
  catch { toast("Failed to delete post."); }
}
window.deletePost = deletePost;

function editPost(id) {
  if (!isAdmin()) return;
  const post = allPosts.find(p => p.id === id);
  if (!post) return;
  editingPostId = id;
  const editor = $("#communityEditor");
  if (editor) editor.innerHTML = post.body || "";
  // Load existing images as pending
  const images = parseImages(post.images);
  pendingImages = images.map(url => ({ file: null, url, status: "done" }));
  renderImagePreviews();
  $("#composerTitle").textContent = "Edit Post";
  $("#composerBadge").style.display = "inline-block";
  $("#postSubmitBtn").textContent = "Update Post";
  $("#cancelEditBtn").style.display = "inline-flex";
  $("#composerCard")?.scrollIntoView({ behavior: "smooth", block: "center" });
}
window.editPost = editPost;

/* ============================================================
   POST DETAIL VIEW
   ============================================================ */
let currentDetailPost = null;

async function openPostDetail(postId) {
  const post = allPosts.find(p => p.id === postId);
  if (!post) return;
  currentDetailPost = post;
  navigate("post-detail");
  const container = $("#postDetailContainer");
  if (!container) return;
  const liked = getLikedPosts().includes(post.id);
  const images = parseImages(post.images);
  const imagesHtml = images.length ? `<div class="post-detail__images post-detail__images--${Math.min(images.length, 4)}">${images.map((url, i) =>
    `<div class="post-detail__image" onclick="openLightbox(${JSON.stringify(images).replace(/"/g, '&quot;')}, ${i})"><img src="${url}" alt="" /></div>`
  ).join("")}</div>` : "";
  const adminControls = isAdmin() ? `
    <div class="post-detail__admin">
      <button class="admin-btn" onclick="editPostFromDetail(${post.id})">Edit</button>
      <button class="admin-btn danger" onclick="deletePostFromDetail(${post.id})">Delete</button>
    </div>` : "";
  container.innerHTML = `
    <div class="post-detail">
      <div class="post-detail__back" onclick="navigate('community')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:16px;height:16px;"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Community
      </div>
      <div class="post-detail__head">
        <div class="post-detail__avatar">${post.pfp ? `<img src="${post.pfp}" alt="avatar" />` : (post.author || "A").charAt(0).toUpperCase()}</div>
        <div>
          <div class="post-detail__author">${post.author || "Guest"}</div>
          <div class="post-detail__time">${new Date(post.created_at).toLocaleString()}</div>
        </div>
        ${adminControls}
      </div>
      <div class="post-detail__body">${post.body || ""}</div>
      ${imagesHtml}
      <div class="post-detail__footer">
        <span class="post-detail__stat ${liked ? "liked" : ""}" onclick="toggleLikeDetail(${post.id})">
          <svg viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span class="like-count-detail-${post.id}">${post.likes || 0}</span> Likes
        </span>
        <span class="post-detail__stat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span id="commentCountDetail">—</span> Comments
        </span>
      </div>
      <div class="comments-section">
        <div class="comments-section__title"><span class="dot"></span> Comments <span class="comments-section__count" id="commentCountLabel"></span></div>
        <div class="comment-form">
          <div class="editor">
            <div class="editor__toolbar">
              <button type="button" class="editor__btn" data-cmd="bold" title="Bold"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg></button>
              <button type="button" class="editor__btn" data-cmd="italic" title="Italic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg></button>
              <button type="button" class="editor__btn" data-cmd="insertUnorderedList" title="Bullet List"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></button>
              <div class="editor__divider"></div>
              <button type="button" class="editor__btn comment-image-btn" title="Add Image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></button>
            </div>
            <div class="editor__content" contenteditable="true" data-placeholder="Write a comment..." id="commentEditor"></div>
          </div>
          <div class="image-previews" id="commentImagePreviews"></div>
          <input type="file" id="commentImageInput" accept="image/*" multiple style="display:none;" />
          <button class="btn btn--start" onclick="submitComment(${post.id})" style="margin-top:10px;">Post Comment</button>
        </div>
        <div id="commentList"></div>
      </div>
    </div>
  `;
  // Init comment editor toolbar
  const commentEditor = $("#commentEditor");
  initEditorToolbar(commentEditor);
  // Comment image upload
  const commentImageBtn = $(".comment-image-btn");
  const commentImageInput = $("#commentImageInput");
  commentImageBtn?.addEventListener("click", () => commentImageInput?.click());
  commentImageInput?.addEventListener("change", (e) => {
    const files = [...(e.target.files || [])];
    files.forEach(handleCommentImageUpload);
    e.target.value = "";
  });
  // Load comments
  await loadComments(post.id);
}
window.openPostDetail = openPostDetail;

let commentPendingImages = [];

async function handleCommentImageUpload(file) {
  if (!file.type.startsWith("image/")) { toast("Please upload an image."); return; }
  if (file.size > MAX_IMAGE_SIZE) { toast("Image too large (max 25MB)."); return; }
  const idx = commentPendingImages.length;
  commentPendingImages.push({ file, url: null, status: "uploading" });
  renderCommentImagePreviews();
  try {
    const url = await supabaseUploadImage(file);
    commentPendingImages[idx].url = url;
    commentPendingImages[idx].status = "done";
    renderCommentImagePreviews();
  } catch {
    commentPendingImages[idx].status = "error";
    renderCommentImagePreviews();
    toast("Failed to upload image.");
  }
}

function renderCommentImagePreviews() {
  const container = $("#commentImagePreviews");
  if (!container) return;
  container.innerHTML = commentPendingImages.map((p, i) => {
    if (p.status === "uploading") return `<div class="image-thumb"><div class="image-thumb__uploading"><div class="status-spinner"></div></div></div>`;
    return `<div class="image-thumb"><img src="${p.url}" alt="preview" /><button class="image-thumb__remove" onclick="removeCommentImage(${i})">&times;</button></div>`;
  }).join("");
}

function removeCommentImage(idx) { commentPendingImages.splice(idx, 1); renderCommentImagePreviews(); }
window.removeCommentImage = removeCommentImage;

async function submitComment(postId) {
  const editor = $("#commentEditor");
  if (!editor) return;
  const body = editor.innerHTML.trim();
  if (!stripHtml(body) && commentPendingImages.length === 0) { toast("Write a comment first."); return; }
  const author = localStorage.getItem(STORAGE_KEYS.user) || "Guest";
  const pfp = localStorage.getItem(STORAGE_KEYS.pfp) || "";
  const imageUrls = commentPendingImages.filter(p => p.url).map(p => p.url);
  const imagesJson = JSON.stringify(imageUrls);
  try {
    await supabaseInsert("comments", { post_id: postId, author, body, pfp, images: imagesJson });
    editor.innerHTML = "";
    commentPendingImages = [];
    renderCommentImagePreviews();
    toast("Comment posted!");
    await loadComments(postId);
  } catch { toast("Failed to post comment."); }
}
window.submitComment = submitComment;

async function loadComments(postId) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/comments?post_id=eq.${postId}&order=created_at.asc`, { headers: SUPABASE_HEADERS });
    if (!res.ok) throw new Error("Failed");
    const comments = await res.json();
    const countEl = $("#commentCountDetail");
    const labelEl = $("#commentCountLabel");
    if (countEl) countEl.textContent = comments.length;
    if (labelEl) labelEl.textContent = `(${comments.length})`;
    // Also update list view count
    const listCount = $(`.comment-count-${postId}`);
    if (listCount) listCount.textContent = comments.length;
    const list = $("#commentList");
    if (!list) return;
    if (!comments.length) {
      list.innerHTML = '<div class="empty-state" style="padding:20px;">No comments yet. Be the first!</div>';
      return;
    }
    list.innerHTML = comments.map((c) => {
      const images = parseImages(c.images);
      const imagesHtml = images.length ? `<div class="comment__images">${images.map((url, i) =>
        `<div class="comment__image" onclick="openLightbox(${JSON.stringify(images).replace(/"/g, '&quot;')}, ${i})"><img src="${url}" alt="" /></div>`).join("")}</div>` : "";
      const adminControls = isAdmin() ? `<div class="comment__admin"><button class="admin-btn danger" onclick="deleteComment(${c.id}, ${postId})">Delete</button></div>` : "";
      return `
      <div class="comment">
        <div class="comment__head">
          <div class="comment__avatar">${c.pfp ? `<img src="${c.pfp}" alt="avatar" />` : (c.author || "A").charAt(0).toUpperCase()}</div>
          <div>
            <div class="comment__author">${c.author || "Guest"}</div>
            <div class="comment__time">${timeAgo(c.created_at)}</div>
          </div>
        </div>
        <div class="comment__body">${c.body || ""}</div>
        ${imagesHtml}
        ${adminControls}
      </div>`;
    }).join("");
  } catch {
    const list = $("#commentList");
    if (list) list.innerHTML = '<div class="empty-state" style="padding:20px;">Comments require a "comments" table in Supabase. See setup instructions.</div>';
  }
}

async function loadCommentCount(postId) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/comments?post_id=eq.${postId}&select=id`, { headers: SUPABASE_HEADERS });
    if (!res.ok) return;
    const data = await res.json();
    const el = $(`.comment-count-${postId}`);
    if (el) el.textContent = data.length;
  } catch {}
}

async function deleteComment(commentId, postId) {
  if (!isAdmin()) return;
  if (!confirm("Delete this comment?")) return;
  try {
    await supabaseDelete("comments", commentId);
    toast("Comment deleted!");
    await loadComments(postId);
  } catch { toast("Failed to delete comment."); }
}
window.deleteComment = deleteComment;

function toggleLikeDetail(postId) {
  toggleLike(postId);
  // Update detail UI
  const post = allPosts.find(p => p.id === postId);
  if (post) {
    const liked = getLikedPosts().includes(postId);
    const countEl = $(`.like-count-detail-${postId}`);
    if (countEl) countEl.textContent = post.likes || 0;
    const statEl = countEl?.closest(".post-detail__stat");
    statEl?.classList.toggle("liked", liked);
  }
}
window.toggleLikeDetail = toggleLikeDetail;

function editPostFromDetail(postId) {
  navigate("community");
  setTimeout(() => editPost(postId), 100);
}
window.editPostFromDetail = editPostFromDetail;

async function deletePostFromDetail(postId) {
  if (!isAdmin()) return;
  if (!confirm("Delete this post?")) return;
  try { await supabaseDelete("posts", postId); toast("Post deleted!"); navigate("community"); await loadPosts(); }
  catch { toast("Failed to delete post."); }
}
window.deletePostFromDetail = deletePostFromDetail;

/* ============================================================
   LIGHTBOX
   ============================================================ */
let lightboxImages = [], lightboxIndex = 0;

function openLightbox(imagesJson, index) {
  lightboxImages = typeof imagesJson === "string" ? JSON.parse(imagesJson) : imagesJson;
  lightboxIndex = index || 0;
  showLightboxImage();
  $("#lightbox").classList.add("open");
}

function showLightboxImage() {
  const img = $("#lightboxImg");
  const counter = $("#lightboxCounter");
  const prev = $("#lightboxPrev");
  const next = $("#lightboxNext");
  if (img) img.src = lightboxImages[lightboxIndex] || "";
  if (counter) counter.textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
  if (prev) prev.style.display = lightboxImages.length > 1 ? "flex" : "none";
  if (next) next.style.display = lightboxImages.length > 1 ? "flex" : "none";
}

function initLightbox() {
  $("#lightboxClose")?.addEventListener("click", () => $("#lightbox").classList.remove("open"));
  $("#lightbox")?.addEventListener("click", (e) => { if (e.target.id === "lightbox") e.target.classList.remove("open"); });
  $("#lightboxPrev")?.addEventListener("click", (e) => {
    e.stopPropagation();
    lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
    showLightboxImage();
  });
  $("#lightboxNext")?.addEventListener("click", (e) => {
    e.stopPropagation();
    lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
    showLightboxImage();
  });
  document.addEventListener("keydown", (e) => {
    if (!$("#lightbox").classList.contains("open")) return;
    if (e.key === "Escape") $("#lightbox").classList.remove("open");
    if (e.key === "ArrowLeft") { lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length; showLightboxImage(); }
    if (e.key === "ArrowRight") { lightboxIndex = (lightboxIndex + 1) % lightboxImages.length; showLightboxImage(); }
  });
}
window.openLightbox = openLightbox;

/* ============================================================
   BLOG
   ============================================================ */
let editingBlogId = null;

function initBlogPosts() {
  const form = $("#newBlogPostForm");
  const titleInput = $("#blogTitleInput");
  const editor = $("#blogEditor");
  const composerCard = $("#blogComposerCard");
  initEditorToolbar(editor);
  if (composerCard && isAdmin()) composerCard.style.display = "block";

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = titleInput?.value.trim() || "Untitled";
    const body = editor?.innerHTML.trim() || "";
    if (!stripHtml(body)) { toast("Please write something before publishing."); return; }
    const author = localStorage.getItem(STORAGE_KEYS.user) || "Admin";
    try {
      if (editingBlogId) {
        await supabaseUpdate("blog_posts", editingBlogId, { title, body, author });
        editingBlogId = null;
        resetBlogComposer();
        toast("Blog post updated!");
      } else {
        await supabaseInsert("blog_posts", { title, body, author });
        resetBlogComposer();
        toast("Blog post published!");
      }
      await loadBlogPosts();
    } catch { toast("Failed to save blog post."); }
  });

  $("#blogCancelEditBtn")?.addEventListener("click", () => {
    editingBlogId = null;
    resetBlogComposer();
  });

  loadBlogPosts();
}

function resetBlogComposer() {
  const titleInput = $("#blogTitleInput");
  const editor = $("#blogEditor");
  if (titleInput) titleInput.value = "";
  if (editor) editor.innerHTML = "";
  $("#blogComposerTitle").textContent = "Write a Blog Post";
  $("#blogComposerBadge").style.display = "none";
  $("#blogSubmitBtn").textContent = "Publish";
  $("#blogCancelEditBtn").style.display = "none";
}

async function loadBlogPosts() {
  try {
    const posts = await supabaseSelect("blog_posts");
    renderBlogPosts(posts);
  } catch {
    renderBlogPosts(JSON.parse(localStorage.getItem(STORAGE_KEYS.blog) || "[]"));
  }
}

function renderBlogPosts(posts) {
  const grid = $("#blogGrid");
  if (!grid) return;
  if (!posts.length) {
    grid.innerHTML = '<div class="empty-state">No blog posts yet. Check back soon!</div>';
    return;
  }
  grid.innerHTML = posts.map((post) => {
    const adminControls = isAdmin() ? `
      <div class="post-card__admin" style="position:absolute;top:8px;right:8px;">
        <button class="admin-btn" onclick="event.stopPropagation();editBlogPost(${post.id})">Edit</button>
        <button class="admin-btn danger" onclick="event.stopPropagation();deleteBlogPost(${post.id})">Delete</button>
      </div>` : "";
    return `
    <article class="blog-card" data-index="${post.id}" style="position:relative;">
      <div class="blog-card__banner"><span style="font-size:2rem;">📰</span></div>
      <div class="blog-card__body">
        <span class="blog-card__tag">News</span>
        <h3 class="blog-card__title">${post.title || "Untitled"}</h3>
        <p class="blog-card__excerpt">${stripHtml(post.body || "").slice(0, 120)}${stripHtml(post.body || "").length >= 120 ? "…" : ""}</p>
        <div class="blog-card__meta">by ${post.author || "Admin"} · ${new Date(post.created_at).toLocaleDateString()}</div>
      </div>
      ${adminControls}
    </article>`;
  }).join("");

  $$(".blog-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".admin-btn")) return;
      const id = Number(card.dataset.index);
      const post = posts.find(p => p.id === id);
      if (post) openBlogViewer(post);
    });
  });
}

async function deleteBlogPost(id) {
  if (!isAdmin()) return;
  if (!confirm("Delete this blog post?")) return;
  try { await supabaseDelete("blog_posts", id); toast("Blog post deleted!"); await loadBlogPosts(); }
  catch { toast("Failed to delete blog post."); }
}
window.deleteBlogPost = deleteBlogPost;

function editBlogPost(id) {
  if (!isAdmin()) return;
  const posts = allBlogPosts || [];
  const post = posts.find(p => p.id === id);
  if (!post) return;
  editingBlogId = id;
  const composer = $("#blogComposerCard");
  if (composer) composer.style.display = "block";
  const titleInput = $("#blogTitleInput");
  const editor = $("#blogEditor");
  if (titleInput) titleInput.value = post.title || "";
  if (editor) editor.innerHTML = post.body || "";
  $("#blogComposerTitle").textContent = "Edit Blog Post";
  $("#blogComposerBadge").style.display = "inline-block";
  $("#blogSubmitBtn").textContent = "Update Post";
  $("#blogCancelEditBtn").style.display = "inline-flex";
  composer?.scrollIntoView({ behavior: "smooth", block: "center" });
}
window.editBlogPost = editBlogPost;

let allBlogPosts = [];

async function loadBlogPostsForEdit() {
  try { allBlogPosts = await supabaseSelect("blog_posts"); } catch { allBlogPosts = []; }
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
  $("#viewerOverlay")?.addEventListener("click", (e) => { if (e.target.id === "viewerOverlay") e.target.classList.remove("open"); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $("#viewerOverlay")?.classList.remove("open");
      $("#usernameModal")?.classList.remove("open");
      $("#lightbox")?.classList.remove("open");
    }
  });
}

/* ============================================================
   SETTINGS
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
      preview.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px;color:var(--text-dim);"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><span>Drag &amp; drop or click to upload</span>`;
    }
  }
  function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) { toast("Please upload an image file."); return; }
    if (file.size > 2 * 1024 * 1024) { toast("Image too large (max 2MB)."); return; }
    const reader = new FileReader();
    reader.onload = () => { localStorage.setItem(STORAGE_KEYS.pfp, reader.result); updateDropzonePreview(); renderAvatar(); toast("Profile picture updated."); };
    reader.readAsDataURL(file);
  }
  dropzone.addEventListener("click", () => pfpInput?.click());
  pfpInput?.addEventListener("change", (e) => { const f = e.target.files?.[0]; if (f) handleFile(f); });
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => { e.preventDefault(); dropzone.classList.remove("dragover"); const f = e.dataTransfer?.files?.[0]; if (f) handleFile(f); });
  clearBtn?.addEventListener("click", () => { localStorage.removeItem(STORAGE_KEYS.pfp); updateDropzonePreview(); renderAvatar(); toast("Profile picture removed."); });
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
  loadBlogPostsForEdit();
  initSettings();
  initLauncherTabs();
  initSeasonEditor();
  loadSeasons();
  initViewer();
  initLightbox();
  loadPosts();
  updateProfileLabel();
  renderAvatar();
});
