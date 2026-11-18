# TECHSTEAL — Private Minecraft Server Website

Community site for the TECHSTEAL private Minecraft server. Dark, neutral design
system, database-backed content, Discord login, and a live server dashboard.

Live: **https://www.techsteal.space** · Repo: `HOT18594/Techsteal-Website`

---

## Season status — read this first

**Season 6 has not launched yet.** The site is in launch-prep mode and says
"coming soon" everywhere on purpose.

The single switch is `seasonLive` in `src/lib/site.ts`, currently `false`:

| `seasonLive: false` (now) | `seasonLive: true` (launch) |
| --- | --- |
| Hero banner reads "Season 6 — coming soon" | Hero banner reads "Season 6 — live now" |
| Home stats tile shows "Coming soon" instead of member/build counts | Counts and "days live" render from the database |
| `/status` has no **Manage** tab | Admins/verified members get start/stop controls |
| `POST /api/server/control` returns 403 | Control requests are accepted |
| Chatty Jr. tells people the season hasn't opened | Chatty Jr. speaks as if the world is open |

Nothing in the code hardcodes the live-state copy — every surface reads the
flag, so launching is a one-line change plus a deploy. The full launch
sequence is at the bottom of this file: [Launch day checklist](#launch-day-checklist).

Current Season 6 config in `site.ts`:

| Field | Value |
| --- | --- |
| `season` / `previousSeason` | `Season 6` / `Season 5` |
| `address` | `techstealseason6.exaroton.me:19457` |
| `version` / `software` | `1.21.11` / `Fabric` |
| `maxPlayers` | `10` |
| `seasonStart` | `2026-11-13` — **update to the real opening day before flipping the flag** |

> **DNS caveat:** `play.techsteal.space` still CNAMEs to the old Season 5 host.
> Until it is flipped at the DNS provider, the site advertises the working
> exaroton address directly. Do not switch `address` back to the CNAME before
> the DNS change lands, or the join instructions break.

---

## Stack

| Layer | What |
| --- | --- |
| Framework | Next.js **16.4** (App Router, Turbopack builds), React **19.3**, TypeScript 5.9 |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`) + the hand-written design system in `src/app/globals.css` |
| Data | Drizzle ORM 0.45 over `postgres.js` → Supabase Postgres (transaction pooler, `prepare: false`) |
| Files | Supabase Storage REST API, public bucket `gallery` (service-role key, server-only) |
| Auth | Discord OAuth → JWT session cookie (jose, HS256, 7 days) |
| Hosting | Vercel, Node 24.x runtime |
| Package manager | **npm** (`package-lock.json` is canonical — do not reintroduce bun/yarn lockfiles) |

No database? The site still renders: every content API falls back to content in
`src/lib/fallback-data.ts` (empty forum/gallery, placeholder timeline/rules).

---

## Quick start

```bash
npm install
cp .env.example .env.local   # fill values; all optional except SESSION_SECRET for login
npm run dev                  # http://localhost:3000
```

Useful scripts:

```bash
npm run build       # production build
npm run lint        # eslint 9 flat config (warnings are accepted; see AGENTS.md)
npm run db:generate # drizzle-kit: generate SQL migration from src/lib/schema.ts
npm run db:push     # drizzle-kit: push schema to the database
npm run db:seed     # seed placeholder content (drizzle/seed.ts)
```

Node 24 + npm 11 are what the project is developed and deployed with.

---

## Environment variables

Everything the code reads (authoritative list):

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | for live content | Supabase **transaction pooler** URI (port 6543). `src/lib/db.ts` also rewrites session-pooler URLs (5432 → 6543) automatically. |
| `SESSION_SECRET` | **yes in prod** | Signs the session JWT. Production fails closed without a strong value. |
| `ADMIN_CODE` | **yes in prod** | Code that promotes a member to admin (`ADMIN_UNLOCK_CODE` is accepted as a fallback). |
| `SUPABASE_URL` | for uploads | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | for uploads | Server-only key; never expose to the browser. Bucket must be named `gallery`. |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | for login | Discord OAuth app. Redirect URIs: `http://localhost:3000/api/auth/discord/callback` and `https://www.techsteal.space/api/auth/discord/callback`. |
| `DISCORD_BOT_TOKEN` / `DISCORD_GUILD_ID` | for verification | Bot must be in the guild; used to verify membership during onboarding. |
| `EXAROTON_TOKEN` / `EXAROTON_SERVER_ID` | for status/control | Exaroton hosting API (the Season 6 server). Server ID may carry a leading `#` (stripped in code). Without these the status page falls back to mcsrvstat.us pings and hides server controls. |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` / `AI_FALLBACK_MODELS` | for assistant | Any OpenAI-compatible `/chat/completions` endpoint. `AI_FALLBACK_MODEL` (singular) is a legacy alias. Empty key = "assistant not connected" mode. |
| `MINECRAFT_SERVER` / `MINECRAFT_PORT` | no | Address for the status API; defaults to `siteConfig.address`. |
| `NEXT_PUBLIC_SITE_URL` | recommended | Canonical URL used in metadata and the forum RSS feed (`https://www.techsteal.space`). |

`.env.example` documents these; `.env*` real files are gitignored and must stay local.

---

## How the site is put together

```
src/
├── app/
│   ├── page.tsx                 # Home: full-bleed voxel hero + season banner + stats/forum/gallery tiles
│   ├── status/                  # Tabbed ops dashboard (Overview, Players, admin Console, Manage)
│   ├── forum/ + forum/[id]/     # Threads, markdown posts/replies, polls, likes, pins, view counts
│   │   └── rss.xml/             # RSS 2.0 feed of the latest 30 threads
│   ├── gallery/                 # Multi-image posts, categories, comments, likes, featured, lightbox
│   ├── members/ + members/[id]/ # Roster + server-rendered public profiles
│   ├── search/                  # Global search (threads, builds, members)
│   ├── history/ rules/ join/    # Server-rendered (real content in first paint)
│   ├── login/ onboarding/ settings/ admin/ assistant/
│   ├── error.tsx global-error.tsx not-found.tsx
│   ├── robots.ts sitemap.ts     # Dynamic SEO robots.txt + XML sitemap
│   ├── layout.tsx               # Root layout: fonts, navbar, footer, palette bootstrap, toast
│   └── api/                     # 36 route handlers (see below)
├── components/                  # One-purpose components (Navbar, Chatty, AdminPanel, RichEditor, Poll, …)
├── lib/                         # site config, db, auth, accounts, exaroton, ai, storage, palettes…
├── types/                       # Shared TypeScript types
public/                          # hero image, Minecraft fonts, assistant logo
drizzle/                         # schema migrations + seed script
scripts/                         # deploy.ps1, apply-vercel-env.mjs, dev utilities
audit/                           # past audit reports (context, not specs)
```

**API routes** (`src/app/api/…`): `status`, `stats`, `activity`, `search`,
`notifications`, `chat`, `forum` (+`[id]`, `like`, `vote`), `gallery` (+`[id]`,
`like`), `members` (+`[id]`), `polls/active`, `timeline`, `rules`, `profile`,
`upload`, `minecraft/skin`, `server/control`, `server/telemetry`, `announcements`
(+`[id]`), `admin/overview`, `admin/members`, `admin/server`, `admin/announcements`,
`admin/rules`, `admin/timeline`, `admin/moderation`, `admin/storage`, `admin/audit`,
`auth/discord` (+`callback`, `verify`), `auth/logout`, `auth/me`.

**Data model** (`src/lib/schema.ts`): `forum_threads`, `forum_replies`,
`forum_polls`, `forum_poll_votes`, `gallery_items`, `gallery_comments`,
`timeline_events`, `rule_sections`, `profiles` (Discord accounts; `role`,
`permissions`, `banned` denylist), `notifications` (per-user inbox behind the
navbar bell), `audit_log` (append-only admin trail), `announcements` (sitewide
bar). Content is edited in the DB — the site updates without a redeploy.

**Announcements**: admins publish, preview, and edit a title, optional body, and
tone from `/admin` → Site Content. The newest active row renders as a dismissible
bar directly under the navbar; hiding a row removes it without deleting history.

**Admin Command Center** (`/admin`, six tabs): **Overview** (KPIs + Season 6
launch readiness checklist + 1-click timeline/rules initialization), **Members**
(roles, inherited vs manual capability perks, MC username & live Discord guild
re-verification, ban/restore, CSV export), **Server Ops** (Start/Stop/Restart,
RAM allocation, live console command runner + redacted `mclo.gs` sharing, and
Exaroton Whitelist/Ops/Bans with 1-click verified member sync), **Site Content**
(Announcements, Server Rules CMS, and History Timeline CMS), **Moderation**
(threads & polls, global replies/comments stream, gallery builds, and Supabase
Storage orphan cleaner), and **Audit Log** (searchable, categorized, CSV-exportable
trail of every privileged action).

**Notifications** (`lib/notifications.ts`): a reply to your thread, a like, an
`@mention`, or a comment/like on your build appends a row. Never self-notifies,
never deletes — marking read only flips a flag.

**Audit trail** (`lib/audit.ts`): server start/stop, ban/unban, role and
permission changes, and admin-code promotions append to `audit_log`, readable in
the admin panel. Best-effort writes — an audit failure never rolls back the action.

**Auth & permissions**: Discord OAuth → JWT session cookie. `accountGate()`
re-reads the account on every mutation (banned/removed members lose access
immediately). Admins: `checkAdmin()` (DB role). Server start/stop: admins,
Discord-verified members, or explicit `server_control` permission — and only
once `seasonLive` is true.

**Design system**: tokens live in `src/app/globals.css` (`--bg`, `--card`,
`--accent`, …). Eight theme palettes in `src/app/palettes.css` (Graphite,
Stone, Forest, Sandstone, Ember, Rosewood, Amethyst, Ocean), selected in
Settings → Appearance (Graphite is the default; stored in localStorage and
applied before first paint). Style: flat dark surfaces, hairline borders, no
glassmorphism/backdrop blur (only the modal scrim), no gradients-as-decoration.
Radius rule: buttons 10px, cards/panels 14px, chips/pills fully rounded.
Fonts: Space Grotesk (body), self-hosted Minecraftia/Minecraft (brand/display),
self-hosted Font Awesome 6 (bundled CSS + webfonts, no CDN dependency).

---

## Deploying

Production = **Vercel** project `techsteal-website` (org `team_jUwg9BDX2xYV4v4y9szPVyvX`).

⚠️ **Known config issue:** the Vercel Git link's *Production Branch* is still set
to `master` while the repo branch is `main`, so a plain `git push` produces a
**preview** deployment and the live domain does not move. Until that setting is
fixed in the Vercel dashboard (Settings → Git → Production Branch → `main`),
deploy production with the CLI:

```powershell
$env:VERCEL_TOKEN = "<token from secrets.env>"
npx vercel deploy --prod
```

`scripts/deploy.ps1` wraps this: it first pushes env vars from `.env.vercel`
via `scripts/apply-vercel-env.mjs` (only that file's keys — never `.env.local`),
then deploys. Verify a deploy actually went live (HTML contains the current
season banner / new asset) instead of trusting the CLI's "production" label.

Environment variables are managed in the Vercel dashboard (all of the table
above); `.env.vercel` only carries the subset the script pushes.

---

## Launch day checklist

Turn Season 6 on in this order — skipping a step leaves the site contradicting
itself (e.g. a "live now" banner over a "coming soon" stats tile).

1. **Set the real date.** `seasonStart` in `src/lib/site.ts` → the actual
   opening day (`YYYY-MM-DD`). The home tile counts "days live" from it.
2. **Fix the join address if DNS moved.** If `play.techsteal.space` now points
   at the Season 6 host, update `address` in `site.ts` and
   `MINECRAFT_SERVER`/`MINECRAFT_PORT` in the Vercel env; otherwise leave both
   pointing at the exaroton host.
3. **Write the timeline row.** Open `/admin` → **Site Content** → **History Timeline**
   (or click **Mark Launched** on the Overview readiness card) to switch Season 6
   from "Coming soon" to the opening date with era "Current Season", and archive
   Season 5 as "Concluded". Without this the History page still says Season 6 is
   upcoming.
4. **Flip the flag.** `seasonLive: false` → `true` in `src/lib/site.ts`.
5. **Verify locally.** `npx tsc --noEmit` → `npm run lint` → `npm run build`,
   then `npm run dev` and check home / status / join say what you expect, and
   that `/status` shows the Manage tab for an admin.
6. **Deploy.** `npx vercel deploy --prod` (see the deploy caveat above).
7. **Verify production.** Load the live domain and confirm the hero reads
   "Season 6 — live now", the stats tile shows counts rather than "Coming soon",
   and `POST /api/server/control` is no longer 403.

Rollback is the same switch: set `seasonLive: false`, redeploy.

---

## Working with this repo

See **`AGENTS.md`** for the working agreement (commands, conventions, security
rules, verification checklist) aimed at both human contributors and AI agents.
