# TECHSTEAL — Private Minecraft Server Website

Community site for the TECHSTEAL private Minecraft server. Dark, neutral design
system, database-backed content, Discord login, and a live server dashboard.

Live: **https://www.techsteal.space** · Repo: `HOT18594/Techsteal-Website`

> **Current season state:** Season 5 has concluded. Season 6 is announced as
> "very soon" (no date). The home hero shows a "Season 6 — very soon" banner,
> `site.ts` has `season: "Season 6"` / `previousSeason: "Season 5"`, and the
> History timeline carries Season 5 (Concluded) + Season 6 (Announced) events.

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

No database? The site still renders: every API route falls back to content in
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
| `EXAROTON_TOKEN` / `EXAROTON_SERVER_ID` | for status/control | Exaroton hosting API. Server ID may carry a leading `#` (stripped in code). Without these the status page falls back to mcsrvstat.us pings and hides server controls. |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` / `AI_FALLBACK_MODELS` | for assistant | Any OpenAI-compatible `/chat/completions` endpoint. `AI_FALLBACK_MODEL` (singular) is a legacy alias. Empty key = "assistant not connected" mode. |
| `MINECRAFT_SERVER` / `MINECRAFT_PORT` | no | Address for the status API; defaults to `siteConfig.address`. |
| `NEXT_PUBLIC_SITE_URL` | recommended | Canonical URL used in metadata (`https://www.techsteal.space`). |

`.env.example` documents these; `.env*` real files are gitignored and must stay local.

---

## How the site is put together

```
src/
├── app/
│   ├── page.tsx                 # Home: full-bleed voxel hero + banner + server/forum/gallery tiles
│   ├── status/                  # Live ops dashboard (Exaroton state, players, charts, console, controls)
│   ├── forum/ + forum/[id]/     # Threads, markdown posts/replies, polls, likes, pins, search
│   ├── gallery/                 # Multi-image posts, comments, likes, featured, lightbox
│   ├── members/ history/ rules/ join/ login/ onboarding/ settings/ admin/ assistant/
│   ├── layout.tsx               # Root layout: fonts, navbar, footer, palette bootstrap, toast
│   └── api/                     # ~30 route handlers (see below)
├── components/                  # One-purpose components (Navbar, Chatty, RichEditor, Poll, …)
├── lib/                         # site config, db, auth, accounts, exaroton, ai, storage, palettes…
├── types/                       # Shared TypeScript types
public/                          # hero image, Minecraft fonts, assistant logo
drizzle/                         # schema migrations + seed script
scripts/                         # deploy.ps1, apply-vercel-env.mjs, dev utilities
audit/                           # past audit reports (context, not specs)
```

**API routes** (`src/app/api/…`): status, chat, forum (+[id], like, vote),
gallery (+[id], like), members, polls/active, timeline, rules, profile,
upload, minecraft/skin, server/control, server/telemetry, admin/members,
auth/discord (+callback, verify), auth/logout, auth/me.

**Data model** (`src/lib/schema.ts`): `forum_threads`, `forum_replies`,
`forum_polls`, `forum_poll_votes`, `gallery_items`, `gallery_comments`,
`timeline_events`, `rule_sections`, `profiles` (Discord accounts; `role`,
`permissions`, `banned` denylist). Content is edited in the DB — the site
updates without a redeploy.

**Auth & permissions**: Discord OAuth → JWT session cookie. `accountGate()`
re-reads the account on every mutation (banned/removed members lose access
immediately). Admins: `checkAdmin()` (DB role). Server start/stop: admins,
Discord-verified members, or explicit `server_control` permission.

**Design system**: tokens live in `src/app/globals.css` (`--bg`, `--card`,
`--accent`, …). Eight theme palettes in `src/app/palettes.css`, selected in
Settings → Appearance (Graphite is the default; stored in localStorage and
applied before first paint). Style: flat dark surfaces, hairline borders, no
glassmorphism/backdrop blur (only the modal scrim), no gradients-as-decoration.
Radius rule: buttons 10px, cards/panels 14px, chips/pills fully rounded.
Fonts: Space Grotesk (body), self-hosted Minecraftia/Minecraft (brand/display),
Font Awesome 6 via CDN.

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
then deploys. Verify a deploy actually went live (HTML contains the season
banner / new asset) instead of trusting the CLI's "production" label.

Environment variables are managed in the Vercel dashboard (all of the table
above); `.env.vercel` only carries the subset the script pushes.

---

## Working with this repo

See **`AGENTS.md`** for the working agreement (commands, conventions, security
rules, verification checklist) aimed at both human contributors and AI agents.
