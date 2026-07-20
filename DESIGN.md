---
version: alpha
name: TechSteal
description: >-
  Dark, "Minecraft-sharp" members hub for the TechSteal Season V Minecraft
  server. Discord-OAuth-gated community portal (server status, join guide,
  community feed, blog). Next.js App Router + Supabase + exaroton. Single
  source of truth for visual tokens AND database/architecture conventions so
  future add-ons stay consistent.
colors:
  green: "#37d05c"
  green-dark: "#168a34"
  green-deep: "#0f5f27"
  cyan: "#20c7d9"
  redstone: "#e04a39"
  discord: "#5865f2"
  wood: "#8b5a2b"
  bg: "#0b0d0e"
  bg-2: "#111416"
  panel: "#171b1e"
  panel-2: "#1d2326"
  panel-3: "#242b2f"
  ink: "#f3f7ef"
  text-soft: "#c8d0c2"
  text-dim: "#8f9a8a"
  line: "rgba(255, 255, 255, 0.10)"
  line-strong: "rgba(255, 255, 255, 0.18)"
typography:
  display:
    fontFamily: "'Barlow Condensed', Impact, sans-serif"
    fontSize: "76px"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "0.02em"
    textTransform: uppercase
  h2:
    fontFamily: "'Barlow Condensed', Impact, sans-serif"
    fontSize: "31px"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "0.03em"
    textTransform: uppercase
  body-md:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.6
  label-mono:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace"
    fontSize: "12px"
    fontWeight: 900
    letterSpacing: "0.05em"
    textTransform: uppercase
rounded:
  sm: 2px
  md: 4px
spacing:
  sm: 8px
  md: 16px
  lg: 22px
  card-gap: 20px
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "#061108"
    rounded: "{rounded.sm}"
    padding: "10px 15px"
  button-danger:
    backgroundColor: "{colors.redstone}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: "10px 15px"
  button-ghost:
    backgroundColor: "{colors.panel-3}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "10px 15px"
  button-discord:
    backgroundColor: "{colors.discord}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: "10px 15px"
  surface-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "22px"
  nav-active:
    backgroundColor: "{colors.green}"
    textColor: "#061108"
    rounded: "{rounded.sm}"
---

# TechSteal — Design & Architecture Reference

> For coding agents: this file is the single source of truth for how the
> TechSteal web app should **look** and how its **data layer** should be shaped.
> When adding a feature, match these tokens, component classes, and DB
> conventions rather than introducing new patterns. Visual tokens above are
> machine-readable (lint with `@google/design.md`). The DB/architecture
> sections below are prose conventions that future add-ons must follow.

## Overview

TechSteal is a private community portal for a modded Minecraft server ("Season V",
address `play.techsteal.space`). It is **members-only**: entry requires Discord
OAuth and (for some actions) membership in the TechSteal Discord guild. The brand
is a "tech/cyber" take on Minecraft — a near-black background, **creeper green**
(`#37d05c`) as the dominant accent, **cyan** (`#20c7d9`) as secondary tech accent,
**redstone** (`#e04a39`) for destructive actions, and Discord blurple only for
Discord affordances. Corners are **sharp/squared** (2–4px radii) — never pill-shaped
except status dots and a few small pills. Headings are uppercase, condensed, heavy.

Tone: utilitarian, game-launcher-like, slightly aggressive. No soft pastels, no
large rounded cards, no light mode.

## Colors

- **Green `#37d05c`** — primary action, active nav, online status, links, brand glow.
  Always pair with near-black text `#061108` on green fills.
- **Cyan `#20c7d9`** — secondary tech accent (discord "members" dot, server address text).
- **Redstone `#e04a39`** — destructive/danger only (stop server, delete, logout-danger).
- **Discord `#5865f2`** — reserved exclusively for Discord login / Discord CTAs.
- **Wood `#8b5a2b`** — rare thematic accent; avoid for chrome.
- **Surfaces:** bg `#0b0d0e`, panel `#171b1e` (cards), panel-2/3 `#1d2326`/`#242b2f`
  (inputs, nested chips). Borders are `2px solid #30393e` (`--line` equivalents).
- **Text:** ink `#f3f7ef` (headings/primary), text-soft `#c8d0c2` (body), text-dim
  `#8f9a8a` (labels/meta). Keep body text at soft/ink, never pure white blocks.

## Typography

- **Display = Barlow Condensed** (uppercase, 800) for every heading: page headers
  (`clamp(46px,6vw,76px)`), card titles (26px), blog titles (34px), topbar title (40px).
- **Body = Inter** (500–900) for paragraphs, buttons, inputs.
- **Mono = JetBrains Mono** (900, uppercase, letter-spaced) for small labels/kickers
  (`.server-dashboard__label`, `.settings-label`), the IP address, and the topbar
  eyebrow. This is the "technical" signal — use it wherever you'd otherwise reach
  for a muted caption.
- Never introduce a fourth font family without updating `:root --font-*` in
  `globals.css` and the `layout.tsx` font `<link>`.

## Layout

- App shell = fixed 286px **Sidebar** (logo, nav, profile/role footer) + **Main**
  (sticky Topbar with page title + status, then centered `.content` capped at
  1180px). See `src/components/AppShell.tsx`, `Sidebar.tsx`.
- New top-level pages = a new `AppPage` in `AppShell.tsx` + a `nav-item` in
  `Sidebar.tsx` (icon = inline 24px stroke SVG, label + mono kicker) + a route under
  `src/app/<page>/page.tsx` that renders `<AppShell page="..." />`. Keep the 5 existing
  pages' structure as the template.
- Home is a 2-column `.home-grid` (status card + discord card). Reuse that grid for
  paired dashboard cards.
- Responsive: sidebar collapses to a 5-tab bottom-ish bar ≤960px; grids go single
  column ≤960px; dashboard single column ≤620px. Preserve these breakpoints.

## Elevation & Depth

- Surfaces use a layered shadow: `0 18px 42px rgba(0,0,0,.34), inset 0 1px 0
  rgba(255,255,255,.05), 0 0 0 1px var(--line)`. Hover lifts `-1px` and uses
  `--shadow-hover`. Use the CSS variables, don't inline new shadows.
- The **Splash/login** is the ONLY place that uses `/img/backdrop.jpeg` (full-bleed
  with a green/cyan radial glow). Every other surface is flat near-black.
- Active nav and primary buttons get an inset top/bottom highlight
  (`inset 0 -3px 0 rgba(0,0,0,.20), inset 0 2px 0 rgba(255,255,255,.22)`) — that
  "embossed" look is the signature; reuse it on any new high-emphasis control.

## Shapes

- Radius tokens: `--radius: 4px` (cards/modals), `--radius-sm: 2px` (buttons,
  inputs, avatars, chips). Sharp is the brand. **Do not** add 8px+/pill radii to
  structural surfaces (pills only for `.role-pill`, `.view-toggle`, status dots).
- Avatars (sidebar/profile/post/comment) are 40px squares, 2px radius, green border,
  initial fallback when no image.
- Player chips and image thumbs are 2px-radius squares with green-tinted borders.

## Components

Use the existing CSS class names in `globals.css` — they are the component library:
- **Cards** = `.card` / `.post-card` / `.blog-card` / `.post-detail` / `.comment` /
  `.modal-card` (all share the panel surface + 2px border + shadow).
- **Buttons** = `.btn--start` (green, primary), `.btn--stop` (redstone), `.btn--ghost`
  (neutral), `.btn--discord` (blurple), `.admin-btn` + `.danger`. Disabled state is
  built in (`opacity .55`).
- **Subtle icon actions** = `.icon-btn` / `.icon-btn--danger` (edit/delete pencils) —
  prefer these over raw text "Delete" buttons inside cards.
- **Inputs** = `.settings-input` / `.blog-title-input`; focus glow is green
  (`0 0 0 4px rgba(55,208,92,.14)`). Don't restyle focus rings.
- **Editors** = `.editor` (contentEditable rich text) + `.editor__toolbar`/`.editor__btn`;
  the `RichTextEditor.tsx` component wraps this. New rich-text fields should reuse it.
- **Modals** = `.modal-overlay`/`.modal-card`; **confirm dialogs** use `.confirm-modal`.
- **Images** are rendered with plain `<img>` (NOT `next/image`) across the app —
  keep that consistent for Supabase Storage URLs and external avatars (crafatar,
  cdn.discordapp.com, mc-heads).

## Database Schema & Conventions

Stack: Supabase (Postgres + Storage). The anon key is exposed to the browser
(`NEXT_PUBLIC_SUPABASE_*`) and is used for all client reads/writes; a service-role
client exists server-side for privileged ops. **All tables use RLS**, and the
project's policies are intentionally permissive (anon can read/insert/update/delete).
When you add a table, follow the existing pattern but **tighten writes where you can**
(see Do's/Don'ts).

### Tables (current)
- **user_roles** — `discord_id text PK`, `role text CHECK ('admin'|'member')`,
  `username text`, `created_at`. Maps Discord id → role. Insert restricted to
  `role='member'`; admin grants happen via `/api/auth/promote` (server-side code) or
  manual dashboard edit.
- **posts** — `id`, `author`, `body text` (HTML), `pfp text`, `images text` (JSON array
  of URLs), `likes int`, `created_at`. Community feed.
- **comments** — `id`, `post_id FK→posts`, `author`, `body text` (HTML), `pfp text`,
  `images text` (JSON), `likes int default 0`, `created_at`.
- **blog_posts** — `id`, `title`, `body text` (HTML), `author`, `created_at`. Admin-authored.
- **seasons** — `id`, `title`, `is_current bool`, `prism/sklauncher/modrinth/curseforge
  text` (each holds launcher-specific HTML instructions). One row per season; the
  `is_current` row drives the Join page default.
- **post_likes** — composite PK `(post_id, discord_id)`, `ON DELETE CASCADE`, plus
  `created_at`. Drives per-user likes.
- **comment_likes** — composite PK `(comment_id, discord_id)`, `ON DELETE CASCADE`.
- **Storage bucket `uploads`** — public, 25MB limit, used for post/comment images.

### Likes pattern (reference implementation)
`SUPABASE_LIKES_MIGRATION.sql` defines: `post_likes`/`comment_likes` tables, triggers
(`sync_*_likes_count`) that keep the denormalized `posts.likes` / `comments.likes`
counters in sync, and four RPCs — `toggle_post_like(p_post_id, p_discord_id)`
→ `{likes, liked}`, `toggle_comment_like(...)`, `my_liked_post_ids(p_discord_id)`,
`my_liked_comment_ids(...)`. The client API in `src/lib/api.ts` exposes
`togglePostLike`, `toggleCommentLike`, `getMyLikedPostIds`, `getMyLikedCommentIds`.
**Any new "like/reaction" feature must reuse this idempotent toggle + count-trigger
pattern**, not a naive `UPDATE ... SET likes = likes + 1` from the client.

### Naming & policy conventions for new tables
- `snake_case` tables/columns; `id BIGSERIAL PRIMARY KEY`; `created_at TIMESTAMPTZ
  DEFAULT NOW()`.
- Enable RLS; add a `read` policy `USING (true)` (public reads are fine for this app),
  and write policies that are as tight as the feature allows. Don't copy the
  `FOR ALL USING (true) WITH CHECK (true)` blanket grant unless the data is
  genuinely public-write.
- If you add user-owned rows, key them by `discord_id` (from the session) and add
  `ON DELETE CASCADE` FKs like the likes tables do.
- Store binary assets in the `uploads` bucket via `uploadImage()` in `src/lib/api.ts`
  (path `posts/<timestamp>_<rand>.<ext>`); never base64-inline into the DB.
- User-generated **HTML** is stored as-is and rendered with `dangerouslySetInnerHTML`
  (posts, comments, blog, seasons). This is a known XSS risk — see Do's/Don'ts.

## Architecture & Conventions

- **Framework:** Next.js 14 App Router (TypeScript). Pages are client components
  (`"use client"`) wrapping `<AppShell>`. API routes live under `src/app/api/**`.
- **Auth:** Discord OAuth (authorization-code flow) in `src/app/api/auth/*`.
  The callback sets an **httpOnly, unsigned JSON session cookie** (`ts_session`)
  containing `{ discordId, username, avatar, role, isNewUser, inGuild }`. New users
  hit `AccountSetup.tsx` (pick display name + agree to rules). `useAuth()`
  (`auth-context.tsx`) exposes `user/loading/login/logout/completeSetup/isAdmin`.
  - **Server control gating:** `inGuild` (computed at login) should gate Start/Stop.
    The `/api/server/control` route exists but is **not yet wired to the UI**.
- **Secrets/env:** `.env.local` holds `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `NEXT_PUBLIC_SITE_URL`,
  `EXAROTON_TOKEN`, `EXAROTON_SERVER_ID`, `ADMIN_UNLOCK_CODE`. Never hardcode secrets
  in source; the admin unlock code is now an env var (was previously inline — do not
  revert).
- **Minecraft server:** status via `/api/server/status` (exaroton → mcsrvstat v2/v3
  fallback); control via `/api/server/control` (start/stop). Both read exaroton creds
  server-side.
- **Data access:** centralize all Supabase calls in `src/lib/api.ts` + types in
  `src/lib/supabase.ts`. Add new queries there; don't scatter raw `supabase.from(...)`
  calls across components.
- **Legacy note:** a vanilla-JS `index.html`/`assets/` duplicate was deleted; the
  Next app is the only source of truth. `data/*.json` files were legacy stubs — do not
  resurrect them.

## Do's and Don'ts

**Do**
- Reuse CSS classes in `globals.css`; add new classes there, not inline styles.
- Use green for primary, redstone for destructive, discord-blue only for Discord.
- Keep headings uppercase + Barlow Condensed; use JetBrains Mono for small labels/IPs.
- Sharp corners (2–4px); embossed inset highlight on high-emphasis controls.
- Centralize DB logic in `src/lib/api.ts`; follow the existing table/RLS/naming pattern.
- Gate privileged actions on `user.role === "admin"` (client) AND verify server-side
  in the API route.
- Use `togglePostLike`-style idempotent RPCs + count triggers for any like/reaction.

**Don't**
- Don't add new accent colors outside green/cyan/redstone/discord/wood.
- Don't add light mode, large radii, or pastel surfaces.
- Don't hardcode secrets or the admin code in source (use env vars).
- Don't render user HTML without sanitizing it — `dangerouslySetInnerHTML` on post/
  comment/blog/season bodies is a live XSS vector. Sanitize (e.g. DOMPurify) before
  insert OR switch the editor to Markdown/BBCode. Treat this as a required fix, not a
  nice-to-have.
- Don't use `alert()` for UX flows where a `.confirm-modal`/toast exists (legacy code
  still uses `alert()` — new code should prefer the in-app modal).
- Don't bypass RLS with blanket `USING (true) WITH CHECK (true)` on sensitive new
  tables; tighten writes.
- Don't store images as base64 in the DB — use the `uploads` bucket.
- Don't introduce a 4th font or change the app shell layout without updating this file.
