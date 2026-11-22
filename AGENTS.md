# AGENTS.md — working agreement for AI agents (and humans)

Read this file before making changes. It tells you how the project is built,
what the conventions are, what never to touch, and how to verify your work.
The README covers the stack, env vars, deployment, and the launch checklist;
this file is the "how to work here" contract.

## Read these first

1. `README.md` — stack, env vars, routes, deploy reality, launch checklist
2. `src/lib/site.ts` — single source of brand/config truth (name, address, season, `seasonLive`)
3. `src/lib/schema.ts` — every table and column
4. `src/app/globals.css` (top: tokens) + `src/app/palettes.css` — design system

## Current state — Season 6 is preparing, not live

`siteConfig.seasonLive` is **`false`** and that is correct right now. The site is
being prepared for Season 6, which opens soon but has not opened.

Everything the visitor sees about the season flows from that one boolean:
hero banner copy, the home stats tile, the `/status` Manage tab, the control API
(403 while false for everyone except admins), and Chatty Jr.'s system prompt. **Never hardcode "live now",
"coming soon", or "Season N" into a component** — read `siteConfig.season` and
gate on `siteConfig.seasonLive`, or the next season transition will leave stale
copy behind. See "Season copy is derived, not typed" below.

Do not flip `seasonLive` to `true` as a side effect of an unrelated task. It is a
launch-day action; the ordered steps are in the README's launch checklist.

## Commands

```bash
npm install          # npm only; package-lock.json is canonical (no bun/yarn files)
npm run dev          # dev server on :3000
npx tsc --noEmit     # type check
npm run lint         # eslint; NEW react-hooks v6 rules are warn-level on purpose
npm run build        # must pass before any deploy
npm run db:generate  # after editing src/lib/schema.ts
npm run db:push      # apply schema (see DB warning below)
npm run db:seed      # placeholder content (refuses if content exists; --force to wipe)
```

Verification order after any change: `tsc --noEmit` → `npm run lint` →
`npm run build` → `npm run dev` and smoke the affected pages (home, forum,
gallery, status, login) plus `/api/forum` for DB connectivity.

**Lint caveat:** run `npx eslint src` (or `npm run lint` with no stray build
directories present). If a leftover `.next*` folder exists that isn't matched by
the ignore list, eslint walks it and reports thousands of phantom problems. The
real baseline is **45 warnings, 0 errors**.

## Conventions

- **API route pattern** (follow existing handlers): `getSessionUser()` →
  `accountGate(user.id)` for the owner path / `checkAdmin()` for admin paths →
  validate + clamp body values → Drizzle query → serialize with `publicRow()`
  → friendly error JSON (`{ error: "..." }`). Mutations are never GET.
  Personalized/dynamic handlers set `export const dynamic = "force-dynamic"`.
- **Fallbacks**: every content API returns `fallback-data.ts` content when the
  DB is missing or errors, so the site never renders empty.
- **Rate limits**: `isRateLimited(key, limit, windowMs)` from `lib/rate-limit`;
  admins exempt. Keys are per-user; use `rateLimitIp` only where anonymous.
- **Uploads**: only through `lib/storage.ts` (magic-byte sniffing, bucket
  lock, garbage collection on delete). Never accept raw client URLs.
- **Markdown**: render only through `components/Markdown.tsx` (React nodes,
  never `dangerouslySetInnerHTML`; links/images http(s) only).
- **Errors**: user-facing strings are short, warm, and non-technical; log the
  technical detail with `console.error` instead of returning it.
- **Time**: `lib/time.ts` helpers with `en-US` locale; never call
  `Date.now()`/`Math.random()` during SSR render paths.
- **Notifications**: create them with `notify()` from `lib/notifications.ts` in
  the handler that causes the event (reply, like, comment, `@mention`). Never
  notify yourself; a notification failure must not roll back the action. The API
  is always scoped to the session user's own inbox.
- **Privileged actions**: any new admin-only or server-control mutation must
  also `logAudit()` from `lib/audit.ts` (actor, action, target, detail) so the
  admin panel's audit trail stays complete. Audit writes are best-effort.
  New audit verbs go in the `AuditAction` union — the column is free text but
  the union is what keeps the panel readable.
- **Announcements**: publish through `POST /api/announcements` (admin-gated,
  rate-limited, title 3–120 chars, body ≤400, tone in `info|warning|critical`).
  The public bar reads only active rows. Never render announcement text as
  HTML — it is plain text by design.
- **View counts**: use `lib/view-counter.ts` (`countView(kind, id, viewer)`)
  rather than duplicating the once-per-window logic.
- **Anonymous endpoints**: `/api/search`, `/api/activity`, `/api/stats` are
  public. Anything they return must already be public elsewhere — no emails,
  permissions, ban state, or raw liker ids.

## Adding things

- **New page**: `src/app/<route>/page.tsx` (+ optional CSS file), nav entry in
  `components/Navbar.tsx` `NAV_LINKS` (or the search/bell cluster), API in
  `src/app/api/<route>/route.ts`.
- **New content type**: table in `schema.ts` → `npm run db:generate` → API
  route → page. All defaulted columns (additive migrations only).
- **New theme colors**: add to `palettes.css` + `lib/palettes.ts`; never
  hardcode colors in components — use the CSS variables.
- **New env var**: read it defensively (`?? ""`), document in README table +
  `.env.example`, set it in the Vercel dashboard.

## Design rules (the site is a flat, neutral-dark system)

- Flat surfaces + 1px hairline borders; **no glassmorphism, no backdrop blur,
  no drop-shadow glows** (only the modal scrim may blur).
- One accent color per palette, applied site-wide via tokens.
- Radius: buttons 10px, cards 14px, chips/pills 999px. Do not mix new shapes.
- Hero imagery is a voxel/geometric style; text zones (center sky band) must
  stay calm for the wordmark + banner overlay.
- Season banners and stats tiles must stay legible over the hero in every
  palette, not just Graphite.

## Never touch

- `.env*` files (except creating your local copy from `.env.example`),
  `secrets.env`, `scripts/CODES.md`, `.vercel-token`, `.vercel/`, and the
  `handoff/` bundle — local secrets; they are gitignored and must stay that way.
  Never print their values into chat, logs, or commits.
- `package-lock.json` is canonical — do not add bun/yarn lockfiles.
- `drizzle/meta` migrations are generated; do not hand-edit.

## Database warning

`npm run db:push` diffs against the live Supabase database and **may offer to
drop a legacy `members` table** (removed from the schema on purpose; it is
currently empty). Confirm the table is empty before accepting any destructive
diff. Prefer additive migrations (`db:generate` → review SQL → `db:push`).

Note: the live database has no `drizzle.__drizzle_migrations` table — the
current schema was pushed with `db:push`, not applied as migration files. The
four tracked migrations in `drizzle/` (`0000` baseline, `0001`, `0002`, and
`0003`, which adds the `announcements` table) describe the current schema but are
not recorded as applied.

`npm run db:seed` clears every content table (forum, gallery, timeline, rules)
before inserting placeholder rows; it refuses to run against a database that
already has content unless passed `--force` (or `SEED_FORCE=1`). Never run it
with `--force` against production unless you intend to wipe the community data.

## Deploy reality

The Vercel Git link's Production Branch is still `master` (wrong; repo branch
is `main`) — a plain `git push` only produces a preview. Deploy production with
the CLI (`npx vercel deploy --prod`, token via `VERCEL_TOKEN` env or a
`.vercel-token` file; the token lives in local `secrets.env`). After any
deploy, **verify the live site actually changed** (check for the current season
banner string / new asset bytes) instead of trusting the CLI output. The
permanent fix is one dashboard toggle: Settings → Git → Production Branch →
`main`.

## Accepted current state (do not "fix" without asking)

- 45 eslint **warnings** from the react-hooks v6 rules
  (`set-state-in-effect` 32, `refs` 5, `immutability` 3,
  `preserve-manual-memoization` 3, `purity` 2) — downgraded to warn in
  `eslint.config.mjs`; adopting them means refactoring every fetch effect.
- `npm audit`: 4 moderate advisories, all in the dev-only
  drizzle-kit/@esbuild-kit/esbuild tooling chain (the 2026-11-20 in-range update
  cleared the previous minimatch/@typescript-eslint advisories); no fix exists
  without downgrading drizzle-kit to 0.18, which is rejected. Runtime tree is
  clean (0 critical / 0 high since the 2026-11 security updates).
- `admincode`/`chat`/`control` rate limits are per-serverless-instance
  (in-memory). Shared-storage counters need a new table; `db:push` risk above.
- View counts are best-effort per warm instance (`lib/view-counter.ts`) — a view
  may be counted more than once across instances. Accepted trade-off.
- Deferred major upgrades: postgres 4, eslint 10, TypeScript 7, dotenv 18,
  drizzle 1.0-rc. Next 16.4 is current.

## Season copy is derived, not typed

The 403 from `POST /api/server/control` and the placeholder timeline in
`fallback-data.ts` both read `siteConfig.season` / `previousSeason` /
`seasonLive` rather than spelling a season out. Keep it that way: if you need a
season name in the UI, interpolate it. The only place a season number should
exist is `src/lib/site.ts`.

## Product state

Season 6 is **preparing to launch**: Fabric 1.21.11, 10 slots, hosted on exaroton
at `techstealseason6.exaroton.me:19457` (server id in `EXAROTON_SERVER_ID`).
Home hero = autumn voxel world (pagoda mountain, torii gate, fox, floating
islands) with a "Season 6 — coming soon" banner while `seasonLive` is false.
`site.ts` carries `season`/`previousSeason`/`seasonLive`/`seasonStart`; the DB
timeline marks Season 6 as Current Season (Coming soon) and Seasons 1–5
Concluded. The status page is a tabbed dashboard (Overview / Players /
admin-only Console / permission-gated Manage); rules, history, and join are
server-rendered. Keep any new copy season-aware. The Season 6 client pack lives
in the Supabase `modpacks` bucket at `season-6/TECHSTEAL-Season-6.zip`.
`GET /api/modpack` streams it to any visitor on the site (including guests and
signed-out users, with light IP rate limiting). The same-site route is in
`siteConfig.modpackDownloadUrl`. The server has no whitelist (`whitelist: "Disabled"`).
Keep the pack out of the `gallery` bucket so image orphan cleanup cannot delete it. The public join address is
`play.techsteal.space`, which CNAMEs to the Season 6 exaroton host. Use that
branded address in all player-facing copy; keep the direct exaroton hostname
for internal hosting operations only.
