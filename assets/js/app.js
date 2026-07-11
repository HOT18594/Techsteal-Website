/* ============================================================
   TechSteal — Minecraft Server Website
   App logic: login, routing, server controls, posts, blog
   ============================================================ */

const MEMBER_CODE = "TechStealMemberCode2026!";
const ADMIN_CODE = "TechStealAdminCode2026!";
const STORAGE_KEYS = {
  auth: "ts_auth",
  user: "ts_user",
  role: "ts_role",
  posts: "ts_posts",
  pfp: "ts_pfp"
};

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function toast(msg) {
  let t = $(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2600);
}

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
      error.textContent = "Invalid key. Try again.";
      error.classList.add("show");
      input.value = "";
      input.focus();
      return;
    }

    sessionStorage.setItem(STORAGE_KEYS.auth, "1");
    localStorage.setItem(STORAGE_KEYS.role, role);
    error.classList.remove("show");
    splash.style.transition = "opacity .5s ease";
    splash.style.opacity = "0";
    setTimeout(() => {
      splash.style.display = "none";
      app.classList.add("show");
      promptForUsername();
      toast(role === "admin" ? "Welcome Admin" : "Welcome Member");
    }, 500);
  });
}

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

  const finish = () => {
    const value = input.value.trim();
    const clean = value || "Guest";
    localStorage.setItem(STORAGE_KEYS.user, clean);
    updateProfileLabel();
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    toast(value ? `Profile saved for ${clean}` : "Using guest profile.");
  };

  saveBtn.onclick = finish;
  skipBtn.onclick = () => {
    localStorage.setItem(STORAGE_KEYS.user, "Guest");
    updateProfileLabel();
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    toast("Using guest profile.");
  };

  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish();
    }
  };
}

function promptForUsername() {
  if (localStorage.getItem(STORAGE_KEYS.user)) {
    updateProfileLabel();
    return;
  }
  openUsernameModal();
}

function updateProfileLabel() {
  const label = $("#profileLabel");
  const role = localStorage.getItem(STORAGE_KEYS.role) || "member";
  const user = localStorage.getItem(STORAGE_KEYS.user) || "Guest";
  if (label) label.textContent = `${user} • ${role === "admin" ? "Admin" : "Member"}`;
  renderAvatar();
}

function renderAvatar() {
  const avatarContainer = $("#sidebarAvatar");
  const pfp = localStorage.getItem(STORAGE_KEYS.pfp);
  if (!avatarContainer) return;
  avatarContainer.innerHTML = "";
  if (pfp) {
    const img = document.createElement("img");
    img.src = pfp;
    img.alt = "Profile";
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

const PAGES = ["home", "join", "community", "blog", "settings"];
const TITLES = { home: "Dashboard", join: "How to Join", community: "Community", blog: "Blog", settings: "Settings" };

function navigate(page) {
  if (!PAGES.includes(page)) page = "home";
  $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.page === page));
  $$(".page").forEach((p) => p.classList.toggle("active", p.id === `page-${page}`));
  const title = $("#topbarTitle");
  if (title) title.textContent = TITLES[page];
  $(".sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function initNav() {
  $$(".nav-item").forEach((n) => n.addEventListener("click", () => navigate(n.dataset.page)));
  $("#logoutBtn")?.addEventListener("click", logout);
  $(".menu-toggle")?.addEventListener("click", () => $(".sidebar").classList.toggle("open"));
}

let serverRefreshTimer = null;

async function refreshServerStatus() {
  const statusEl = $("#serverStatusText");
  const dotEl = $("#serverStatusDot");
  const playersEl = $("#serverPlayers");
  const addressEl = $("#serverAddress");
  const ramEl = $("#serverRam");
  const stateEl = $("#serverState");

  try {
    const res = await fetch("/api/exaroton/server");
    const data = await res.json();
    const server = data?.server || data;
    const online = Boolean(server?.online || server?.status === "online");
    const players = server?.players?.online ?? server?.player_count ?? server?.players ?? "—";
    const address = server?.address || server?.server_address || "play.techsteal.net";
    const ram = server?.ram || server?.memory || server?.ram_usage || "—";

    if (statusEl) statusEl.textContent = online ? "Online" : "Offline";
    if (dotEl) dotEl.classList.toggle("offline", !online);
    if (playersEl) playersEl.textContent = `${players}`;
    if (addressEl) addressEl.textContent = address;
    if (ramEl) ramEl.textContent = ram;
    if (stateEl) {
      stateEl.textContent = online ? "Running" : "Stopped";
      stateEl.className = online ? "stat__value ok" : "stat__value bad";
    }
  } catch {
    if (statusEl) statusEl.textContent = "Unavailable";
    if (dotEl) dotEl.classList.add("offline");
    if (playersEl) playersEl.textContent = "—";
    if (addressEl) addressEl.textContent = "play.techsteal.net";
    if (ramEl) ramEl.textContent = "—";
    if (stateEl) {
      stateEl.textContent = "Unavailable";
      stateEl.className = "stat__value bad";
    }
  }
}

async function callServerAction(action) {
  const actions = {
    start: "/api/exaroton/server/start",
    stop: "/api/exaroton/server/stop",
    restart: "/api/exaroton/server/restart"
  };

  const res = await fetch(actions[action], { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Action failed");
  toast(`${action[0].toUpperCase()}${action.slice(1)} request sent.`);
  await refreshServerStatus();
}

function initServerControls() {
  $("#btnStart")?.addEventListener("click", async () => {
    try { await callServerAction("start"); } catch (error) { toast(error.message || "Failed to start server."); }
  });
  $("#btnStop")?.addEventListener("click", async () => {
    try { await callServerAction("stop"); } catch (error) { toast(error.message || "Failed to stop server."); }
  });
  $("#btnRestart")?.addEventListener("click", async () => {
    try { await callServerAction("restart"); } catch (error) { toast(error.message || "Failed to restart server."); }
  });
  $("#btnRefresh")?.addEventListener("click", refreshServerStatus);
  refreshServerStatus();
  if (serverRefreshTimer) clearInterval(serverRefreshTimer);
  serverRefreshTimer = setInterval(refreshServerStatus, 20000);
}

function initCopyIP() {
  $("#copyIP")?.addEventListener("click", async () => {
    const ip = $("#serverAddress").textContent.trim();
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
}

let seasonData = [];
let activeSeasonId = 5;

async function loadSeasons() {
  try {
    const res = await fetch("/api/admin/seasons");
    const data = await res.json();
    seasonData = data.seasons || [];
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
    picker.innerHTML = '<button class="season-btn active" data-season="5">Season 5</button>';
  } else {
    picker.innerHTML = seasonData.map((season) => `<button class="season-btn ${season.id === activeSeasonId ? "active" : ""}" data-season="${season.id}">${season.title}</button>`).join("");
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
  const season = seasonData.find((item) => item.id === activeSeasonId) || seasonData[0];
  const titleEl = $("#seasonTitle");
  const bodyEl = $("#seasonBody");
  const titleInput = $("#seasonTitleInput");
  const bodyInput = $("#seasonBodyInput");
  const panel = $("#seasonEditorPanel");

  if (!season) return;
  if (titleEl) titleEl.textContent = season.title || "Season";
  if (bodyEl) bodyEl.innerHTML = season.body || "";
  if (titleInput) titleInput.value = season.title || "";
  if (bodyInput) bodyInput.value = season.body || "";
  if (panel) panel.style.display = localStorage.getItem(STORAGE_KEYS.role) === "admin" ? "grid" : "none";
}

async function saveSeasons() {
  const titleInput = $("#seasonTitleInput");
  const bodyInput = $("#seasonBodyInput");
  if (!titleInput || !bodyInput) return;

  const updated = seasonData.map((item) => item.id === activeSeasonId ? { ...item, title: titleInput.value.trim(), body: bodyInput.value.trim() } : item);
  seasonData = updated;
  const res = await fetch("/api/admin/seasons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seasons: seasonData })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Unable to save seasons");
  renderSeasonPicker();
  toast("Seasons updated.");
}

function initSeasonEditor() {
  const saveBtn = $("#saveSeasonBtn");
  const newSeasonBtn = $("#newSeasonBtn");
  saveBtn?.addEventListener("click", async () => {
    try { await saveSeasons(); } catch (error) { toast(error.message || "Failed to save season"); }
  });
  newSeasonBtn?.addEventListener("click", () => {
    const nextId = Math.max(0, ...seasonData.map((item) => item.id)) + 1;
    seasonData = [...seasonData, { id: nextId, title: `Season ${nextId}`, body: "<p>New season content</p>" }];
    activeSeasonId = nextId;
    renderSeasonPicker();
    toast("New season created.");
  });
  loadSeasons();
}

function initSettings() {
  const form = $("#settingsForm");
  const usernameInput = $("#settingsUsername");
  const pfpInput = $("#settingsPfpInput");
  const preview = $("#settingsPfpPreview");
  if (!form || !usernameInput || !pfpInput || !preview) return;

  usernameInput.value = localStorage.getItem(STORAGE_KEYS.user) || "";
  const currentPfp = localStorage.getItem(STORAGE_KEYS.pfp);
  if (currentPfp) preview.innerHTML = `<img src="${currentPfp}" alt="profile preview" />`;
  else preview.textContent = "No image";

  pfpInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      localStorage.setItem(STORAGE_KEYS.pfp, dataUrl);
      preview.innerHTML = `<img src="${dataUrl}" alt="profile preview" />`;
      renderAvatar();
      toast("Profile picture updated.");
    };
    reader.readAsDataURL(file);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = usernameInput.value.trim();
    if (!value) {
      toast("Please enter a username.");
      return;
    }
    localStorage.setItem(STORAGE_KEYS.user, value);
    updateProfileLabel();
    toast("Profile saved.");
  });
}

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
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const command = button.getAttribute("data-cmd");
      const value = button.getAttribute("data-value") || null;
      if (!command) return;

      editor.focus();
      document.execCommand(command, false, value);
      if (command === "insertUnorderedList" || command === "insertOrderedList") {
        setTimeout(() => editor.focus(), 0);
      }
      const stateCommands = ["bold", "italic", "underline"];
      if (stateCommands.includes(command)) {
        button.classList.toggle("active", document.queryCommandState(command));
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
    if (!stripHtml(body)) {
      toast("Please write something before posting.");
      return;
    }
    const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.posts) || "null") || [];
    posts.unshift({
      id: `local_${Date.now()}`,
      author: localStorage.getItem(STORAGE_KEYS.user) || "Guest",
      body,
      images: JSON.stringify([]),
      pfp: localStorage.getItem(STORAGE_KEYS.pfp) || "",
      created_at: new Date().toISOString(),
      likes: 0
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
  const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.posts) || "null") || [];
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

function initBlogPosts() {
  const form = $("#newBlogPostForm");
  const titleInput = $("#blogTitleInput");
  const editor = $("#blogEditor");
  const composerCard = $("#blogComposerCard");
  initEditorToolbar(editor);
  if (composerCard && localStorage.getItem(STORAGE_KEYS.role) === "admin") composerCard.style.display = "block";

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = titleInput?.value.trim() || "Untitled";
    const body = editor?.innerHTML.trim() || "";
    if (!stripHtml(body)) { toast("Please write something before publishing."); return; }
    const posts = JSON.parse(localStorage.getItem("ts_blog_posts") || "null") || [];
    posts.unshift({ title, body, author: localStorage.getItem(STORAGE_KEYS.user) || "Admin", created_at: new Date().toISOString() });
    localStorage.setItem("ts_blog_posts", JSON.stringify(posts));
    renderBlogPosts(posts);
    if (titleInput) titleInput.value = "";
    if (editor) editor.innerHTML = "";
    toast("Blog post published locally.");
  });

  renderBlogPosts(JSON.parse(localStorage.getItem("ts_blog_posts") || "null") || []);
}

function renderBlogPosts(posts) {
  const grid = $("#blogGrid");
  if (!grid) return;
  if (!posts.length) {
    grid.innerHTML = '<div class="empty-state">No blog posts yet. Check back soon!</div>';
    return;
  }
  grid.innerHTML = posts.map((post) => `
    <article class="blog-card">
      <div class="blog-card__banner" style="background: linear-gradient(135deg, #1e293b, #0f766e);">
        <span style="font-size:2rem;">📰</span>
      </div>
      <div class="blog-card__body">
        <span class="blog-card__tag">News</span>
        <h3 class="blog-card__title">${post.title || "Untitled"}</h3>
        <p class="blog-card__excerpt">${stripHtml(post.body || "").slice(0, 120)}${stripHtml(post.body || "").length >= 120 ? "..." : ""}</p>
        <div class="blog-card__meta">by ${post.author || "Admin"}</div>
      </div>
    </article>
  `).join("");
}

function initViewer() {
  $("#viewerClose")?.addEventListener("click", () => $("#viewerOverlay")?.classList.remove("open"));
  $("#viewerOverlay")?.addEventListener("click", (e) => { if (e.target.id === "viewerOverlay") e.target.classList.remove("open"); });
  $("#lightboxClose")?.addEventListener("click", () => $("#lightbox")?.classList.remove("open"));
  $("#lightbox")?.addEventListener("click", (e) => { if (e.target.id === "lightbox") e.target.classList.remove("open"); });
}

document.addEventListener("DOMContentLoaded", () => {
  initLogin();
  initNav();
  initServerControls();
  initCopyIP();
  initCommunityPosts();
  initBlogPosts();
  initSettings();
  initSeasonEditor();
  initViewer();
  renderPosts();
  updateProfileLabel();
  renderAvatar();
});
