# AGENTS.md — working agreement for AI agents (and humans)

Read this file before making changes. It tells you how the project is built,
what the conventions are, what never to touch, and how to verify your work.
The README covers the stack, env vars, and deployment; this file is the
"how to work here" contract.

## Read these first

1. `README.md` — stack, env vars, routes, deploy reality
2. `src/lib/site.ts` — single source of brand/config truth (name, IP, season)
3. `src/lib/schema.ts` — every table and column
4. `src/app/globals.css` (top: tokens) + `src/app/palettes.css` — design system

## Commands

```bash
npm install          # npm only; package-lock.json is canonical (no bun/yarn files)
npm run dev          # dev server on :3000
npx tsc --noEmit     # type check
npm run lint         # eslint; NEW react-hooks v6 rules are warn-level on purpose (32 known warnings)
npm run build        # must pass before any deploy
npm run db:generate  # after editing src/lib/schema.ts
npm run db:push      # apply schema (see DB warning below)
npm run db:seed      # placeholder content
```

Verification order after any change: `tsc --noEmit` → `npm run lint` →
`npm run build` → `npm run dev` and smoke the affected pages (home, forum,
gallery, status, login) plus `/api/forum` for DB connectivity.

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

## Adding things

- **New page**: `src/app/<route>/page.tsx` (+ optional CSS file), nav entry in
  `components/Navbar.tsx` `NAV_LINKS`, API in `src/app/api/<route>/route.ts`.
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

## Never touch

- `.env*` files (except creating your local copy from `.env.example`),
  `secrets.env`, `scripts/CODES.md`, `.vercel-token`, `.vercel/` — local
  secrets; they are gitignored and must stay that way. Never print their
  values into chat, logs, or commits.
- `package-lock.json` is canonical — do not add bun/yarn lockfiles.
- `drizzle/meta` migrations are generated; do not hand-edit.

## Database warning

`npm run db:push` diffs against the live Supabase database and **may offer to
drop a legacy `members` table** (removed from the schema on purpose). Confirm
the table is empty before accepting any destructive diff. Prefer additive
migrations (`db:generate` → review SQL → `db:push`).

## Deploy reality

The Vercel Git link's Production Branch is still `master` (wrong; repo branch
is `main`) — a plain `git push` only produces a preview. Deploy production with
the CLI (`npx vercel deploy --prod`, token via `VERCEL_TOKEN` env or a
`.vercel-token` file; the token lives in local `secrets.env`). After any
deploy, **verify the live site actually changed** (check for the season
banner string / new asset bytes) instead of trusting the CLI output. The
permanent fix is one dashboard toggle: Settings → Git → Production Branch →
`main`.

## Accepted current state (do not "fix" without asking)

- 32 eslint **warnings** from the new react-hooks v6 rules
  (`set-state-in-effect`, `purity`, `refs`, `immutability`,
  `preserve-manual-memoization`, `exhaustive-deps`) — downgraded to warn in
  `eslint.config.mjs`; adopting them means refactoring every fetch effect.
- `npm audit`: 11 moderate advisories, all in the dev-only
  drizzle-kit/esbuild/eslint chain, no fix available in-range. Runtime tree is
  clean (0 critical / 0 high since the 2026-11 security updates).
- `admincode`/`chat`/`control` rate limits are per-serverless-instance
  (in-memory). Shared-storage counters need a new table; `db:push` risk above.
- Deferred major upgrades: postgres 4, eslint 10, TypeScript 7, dotenv 18,
  drizzle 1.0-rc. Next 16.4 is current.

## Product state

Season 5 concluded; Season 6 announced as "very soon" (no date). Home hero =
autumn voxel world (pagoda mountain, torii gate, fox, floating islands).
`site.ts` carries `season`/`previousSeason`; history timeline in the DB has
Season 5 (Concluded) and Season 6 (Announced) events. Keep any new copy
season-aware.
