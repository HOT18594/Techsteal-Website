# TECHSTEAL — Private Minecraft Server Website

A dark, pixel-accented site for a private Minecraft server, built with
**Next.js (App Router) + React + TypeScript + Tailwind CSS v4** and backed by a
**Postgres database (Drizzle ORM)**. Deploys to Vercel.

All descriptive/lore text has been intentionally removed. The site is a clean
shell of functional sections — **Status, AI Assistant, Forum, History, Members,
Gallery, Rules, How to Join**, plus member/admin auth — ready for your own
content.

---

## Forum & Gallery (overhauled)

**Forum**
- Rich markdown editor: toolbar (bold/italic/strike, headings, lists, quotes,
  code blocks, spoilers, links), live preview, `Ctrl+B/I/K` shortcuts.
- Image embedding in posts and replies — pick, **paste**, or drag a file; it's
  compressed in the browser and uploaded to Supabase Storage with progress.
- Threads and replies are editable by their authors (admins anytime), with an
  "edited" marker. Thread/reply **likes**, **view counters**, and **pins**.
- Admins can **lock** threads (closes replies) and attach **polls** with an end
  date: one vote per account (changeable until the poll ends), live results
  with percentage bars, and a countdown.
- Server-side search, category filters, sort modes (Latest/Top/Hot/Most
  viewed/Unanswered) and pagination keep the list fast as it grows.

**Gallery**
- Multi-image posts (up to 8) with a cover pick, markdown descriptions, and
  real per-user likes.
- Client-side image compression (≤1920px WebP) before upload — screenshots
  shrink ~80–95%, so pages load fast and uploads stay under the serverless
  body limit. Each image uploads separately with its own progress bar.
- Comments on every post, view counters, admin **featured** (pinned) posts,
  delete-your-own, and a split-pane lightbox with keyboard navigation across
  every image.

All content renders through a safe, dependency-free markdown renderer (React
nodes, never `dangerouslySetInnerHTML`; links/images limited to http(s)).

---

## Tech stack & structure

```
Website/
├── src/
│   ├── app/
│   │   ├── page.tsx               # Home (hero + feature tiles)
│   │   ├── layout.tsx             # Root layout: fonts, nav, footer, global effects
│   │   ├── globals.css            # Tailwind + design system + site effects
│   │   ├── icon.svg
│   │   ├── status/                # Live Minecraft server status
│   │   ├── forum/                 # Forum threads
│   │   ├── members/               # Member directory
│   │   ├── gallery/               # Build gallery
│   │   ├── history/               # Season timeline
│   │   ├── rules/                 # Rules + acknowledge (fires emoji confetti 🎉)
│   │   ├── join/                  # How-to-join steps
│   │   ├── login/                 # Member/admin login
│   │   ├── onboarding/            # First-time setup (admin code, Discord, MC name)
│   │   ├── settings/              # Profile & settings (MC name, admin code, verify)
│   │   ├── admin/                 # Admin panel (manage members)
│   │   ├── assistant/             # Chatty Jr. AI assistant
│   │   └── api/                   # Serverless API routes (Vercel functions)
│   │       ├── status/  chat/  forum/  members/  gallery/  timeline/  rules/
│   │       ├── auth/discord/  auth/discord/callback/  auth/discord/verify/
│   │       ├── auth/logout/  auth/me/  profile/  minecraft/skin/
│   │       └── admin/members/
│   ├── components/                # One purpose per component
│   │   ├── Navbar, Footer, BackToTop, Toast, SubPage
│   │   ├── HeroClient, PageEnter, RevealObserver, MemberSlideshow
│   │   ├── Avatar, OnboardingReminder, Chatty (AI chat UI)
│   │   └── ScrollFx (cinematic eased scroll), CursorFx (custom cursor),
│   │       AdminPanel
│   ├── lib/                       # site config, db, auth, AI, helpers,
│   │                              # fallback content, hooks
│   └── types/                     # Shared TypeScript types
├── public/
│   ├── techsteal-hero.jpeg        # Hero background (all public assets live here)
│   └── fonts/                     # Self-hosted Minecraft fonts (TTF)
├── drizzle/
│   ├── seed.ts                    # Seeds placeholder content into the DB
│   └── (generated migrations)
├── drizzle.config.ts              # Drizzle CLI config
├── next.config.ts                 # Next.js config
├── postcss.config.mjs             # Tailwind v4 postcss plugin
├── eslint.config.mjs              # ESLint flat config
├── bun.lock                       # Single lockfile — install with bun
└── .env.example                   # Copy to .env.local
```

### Why this layout scales

- **Content lives in the database**, not the code. Edit members, threads, builds,
  timeline, or rules in the DB and the site updates without a redeploy.
- **Each section is its own route + its own API route.** Adding a new section
  (e.g. a Store, a Shop, an Events page) means adding one folder in `src/app/`
  and one route in `src/app/api/` — nothing else changes.
- **No database → still works.** If `DATABASE_URL` is missing, the API routes
  return placeholder content from `src/lib/fallback-data.ts`, so the site
  renders fully before you ever connect a DB.
- **Central config** in `src/lib/site.ts` — name, IP, version, links. Change it
  in one place.

---

## Getting started

> Requires **Node.js 20+** (or **bun** — this repo uses `bun.lock`, so `bun`
> is the expected package manager).

```bash
# 1. Install dependencies
bun install

# 2. Create your env file
cp .env.example .env.local
# then edit .env.local with your real values
```

### Setting up the database (Supabase)

1. Create a free project at **[supabase.com](https://supabase.com)** — no credit card needed.
2. In **Project Settings → Database → Connection string**, pick the **Session pooler** tab (port `5432`), copy the **URI**, and replace `[YOUR-PASSWORD]` with the database password you set when creating the project.
3. Put it in `DATABASE_URL` in `.env.local` (example in `.env.example`).
4. Create the tables and seed placeholder content:

```bash
bun run db:push     # creates the tables from src/lib/schema.ts
bun run db:seed     # fills them with the sample content
```

Any Postgres works (Supabase, Neon, RDS, local) — the driver is
[postgres.js](https://github.com/porsager/postgres) via Drizzle.

### Connecting the APIs

| API | Where | How |
| --- | ----- | --- |
| **Minecraft status** | `/api/status` | Set `MINECRAFT_SERVER` / `MINECRAFT_PORT`. Uses free [mcsrvstat.us](https://mcsrvstat.us). Works with any Minecraft (Java) server address. |
| **AI assistant** | `/api/chat` | Set `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`. Any OpenAI-compatible endpoint works. The key never leaves the server. Leave empty to run in "not connected" mode. |
| **Forum / content DB** | `/api/forum` etc. | Handled by `DATABASE_URL`. The "New Thread" button already POSTs to `/api/forum`. |
| **Auth (login/admin)** | `/api/auth/*`, `/api/admin/*` | Discord OAuth (sign in with Discord). Accounts are created on first login; the session cookie is a JWT signed with `SESSION_SECRET`. The admin role is unlocked with the admin code in onboarding/profile settings. |

### Running locally

```bash
bun run dev        # http://localhost:3000
bun run build      # production build
```

---

## Deploying to Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
3. In **Project Settings → Git**, make sure **Production Branch is `main`** —
   otherwise every push deploys as a **Preview** and your production URL never
   updates (this happened to this project — the fix is one dropdown in
   Settings → Git, or "Promote to Production" on a deployment).
4. In **Project Settings → Environment Variables**, add the same values from
   `.env.local`:
   - `DATABASE_URL`
   - `MINECRAFT_SERVER`, `MINECRAFT_PORT`
   - `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`
   - `SESSION_SECRET`
5. Deploy. Every push to `main` redeploys automatically.

### Env variables reference

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | for live content | Postgres connection string |
| `MINECRAFT_SERVER` | no | Server address (defaults to `siteConfig.address`) |
| `MINECRAFT_PORT` | no | Server port |
| `AI_API_KEY` | for AI chat | API key for an OpenAI-compatible endpoint |
| `AI_BASE_URL` | no | Endpoint base URL (default OpenRouter) |
| `AI_MODEL` | no | Model name (default `poolside/laguna-s-2.1:free`) |
| `SESSION_SECRET` | **yes (prod)** | Strong random value signing the session cookie. Falls back to a dev secret locally — set a real one before deploying or sessions can be forged. |
| `ADMIN_CODE` | **yes (prod)** | Code that promotes a member to admin. In production the site refuses to unlock admin without this variable (it used to be a hardcoded constant — that was a security hole). |
| `DISCORD_CLIENT_ID` | for Discord login | OAuth client id |
| `DISCORD_CLIENT_SECRET` | for Discord login | OAuth client secret |
| `DISCORD_BOT_TOKEN` | no | Bot token to verify server membership during onboarding |
| `DISCORD_GUILD_ID` | no | Official server id for membership verification |

---

## Customizing

- **Branding, IP, links** → `src/lib/site.ts` (one file, everything reads from it).
- **Placeholder content** → `src/lib/fallback-data.ts`, or edit directly in the DB.
- **Colors & theme** → CSS variables at the top of `src/app/globals.css`.
- **Fonts** → the Minecraft fonts are self-hosted in `public/fonts` and wired
  up via `@font-face` in `src/app/globals.css`; the body font (Space Grotesk)
  is a Google Font loaded in `src/app/layout.tsx`.
- **Site effects** (custom cursor, cinematic scroll, hero title animation,
  emoji confetti) → `src/components/CursorFx.tsx`, `src/components/ScrollFx.tsx`,
  `src/components/HeroClient.tsx`, and the effects section of `globals.css`.
