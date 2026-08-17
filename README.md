# TECHSTEAL — Private Minecraft Server Website

A dark, pixel-accented single-page site for a private Minecraft server, built with
**Next.js (App Router) + React + TypeScript + Tailwind CSS v4** and backed by a
**Postgres database (Drizzle ORM)**. Deploys to Vercel in one click.

All descriptive/lore text has been intentionally removed. The site is a clean
shell of functional sections: **Status, AI Assistant, Forum, History, Members,
Gallery, and Rules** — ready for your own content.

---

## Tech stack & structure

```
Website/
├── src/
│   ├── app/
│   │   ├── api/                 # Serverless API routes (Vercel functions)
│   │   │   ├── status/          # GET  → Minecraft server status
│   │   │   ├── chat/            # POST → AI assistant reply
│   │   │   ├── forum/           # GET/POST → forum threads
│   │   │   ├── members/         # GET → members
│   │   │   ├── gallery/         # GET → gallery items
│   │   │   ├── timeline/        # GET → history timeline
│   │   │   └── rules/           # GET → rules sections
│   │   ├── layout.tsx           # Root layout (fonts, nav, footer)
│   │   ├── page.tsx             # Single-page home
│   │   └── globals.css          # Tailwind + design system
│   ├── components/              # One component per section
│   ├── lib/                     # Config, DB, helpers, fallback content
│   └── types/                   # Shared TypeScript types
├── drizzle/
│   ├── seed.ts                  # Seeds placeholder content into the DB
│   └── (generated migrations)
├── drizzle.config.ts            # Drizzle CLI config
└── .env.example                 # Copy to .env.local
```

### Why this layout scales

- **Content lives in the database**, not the code. Edit members, threads, builds,
  timeline, or rules in the DB and the site updates without a redeploy.
- **Each section is its own component + its own API route.** Adding a new
  section (e.g. a Store, a Shop, an Events page) means adding one folder in
  `components/` and one route in `src/app/api/` — nothing else changes.
- **No database → still works.** If `DATABASE_URL` is missing, the API routes
  return placeholder content from `src/lib/fallback-data.ts`, so the site
  renders fully before you ever connect a DB.
- **Central config** in `src/lib/site.ts` — name, IP, version, links. Change it
  in one place.

---

## Getting started

> Requires **Node.js 20+** locally (not needed for deploying to Vercel — Vercel
> builds in the cloud).

```bash
# 1. Install dependencies
npm install

# 2. Create your env file
cp .env.example .env.local
# then edit .env.local with your real values
```

### Setting up the database

1. Create a free Postgres instance on **[Neon](https://neon.tech)** (or use
   Vercel Postgres / Supabase).
2. Copy the **pooled connection string** into `DATABASE_URL` in `.env.local`.
3. Create the tables and seed placeholder content:

```bash
npm run db:push     # creates the tables from src/lib/schema.ts
npm run db:seed     # fills them with the sample content
```

### Connecting the APIs

| API | Where | How |
| --- | ----- | --- |
| **Minecraft status** | `/api/status` | Set `MINECRAFT_SERVER` / `MINECRAFT_PORT`. Uses free [mcsrvstat.us](https://mcsrvstat.us). Works with any Minecraft (Java) server address. |
| **AI assistant** | `/api/chat` | Set `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`. Any OpenAI-compatible endpoint works. The key never leaves the server. Leave empty to run in "not connected" mode. |
| **Forum / content DB** | `/api/forum` etc. | Handled by `DATABASE_URL`. The "New Thread" button already POSTs to `/api/forum`. |
| **Discord / auth / other** | — | Add new routes under `src/app/api/` and new sections in `components/`. The pattern is the same for all of them. |

### Running locally

```bash
npm run dev        # http://localhost:3000
npm run build      # production build
```

---

## Deploying to Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
   Vercel auto-detects Next.js — no config needed.
3. In **Project Settings → Environment Variables**, add the same values from
   `.env.local`:
   - `DATABASE_URL`
   - `MINECRAFT_SERVER`, `MINECRAFT_PORT`
   - `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`
4. Deploy. Every push to `main` redeploys automatically.

### Env variables reference

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | for live content | Postgres connection string |
| `MINECRAFT_SERVER` | no | Server address (defaults to `siteConfig.address`) |
| `MINECRAFT_PORT` | no | Server port |
| `AI_API_KEY` | for AI chat | API key for an OpenAI-compatible endpoint |
| `AI_BASE_URL` | no | Endpoint base URL (default OpenAI) |
| `AI_MODEL` | no | Model name (default `gpt-4o-mini`) |
| `NEXT_PUBLIC_SITE_URL` | no | Public site URL |

---

## Customizing

- **Branding, IP, links** → `src/lib/site.ts` (one file, everything reads from it).
- **Placeholder content** → `src/lib/fallback-data.ts`, or edit directly in the DB.
- **Colors & theme** → CSS variables at the top of `src/app/globals.css`.
- **Fonts** → `src/app/layout.tsx` (Google Fonts via `next/font`).
