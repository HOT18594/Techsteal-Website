# Platform / Dependency Update Audit — Techsteal Website

Date: 2026-11-13 · Workspace: `C:\Users\ethan\OneDrive\Desktop\Techsteal\Website` · Local Node v24.20.0 / npm 11.19.0 (matches Vercel Node 24.x runtime)

---

## 1. Conclusion summary

**High confidence.** The installed stack is one in-range patch/minor bump away from current on everything except four majors (next 16, postgres 4, eslint 10, typescript 7). One **high** advisory (drizzle-orm SQL injection) **cannot be fixed within the current semver range** and requires the 0.44 → 0.45 bump; two more **high** advisories live in the postcss copy bundled inside `next` and are **only fixed in Next 16.4.6** — no 15.x fix exists. Everything else is low risk. Recommended: Phase 1 (in-range updates, incl. drizzle 0.45.4) now; Phase 2 (Next 16) immediately after — the codebase is already Next-16-ready (verified below).

**Methodology caveats (read first):**
- The project has **no `package-lock.json`**, so `npm audit --json` fails with `ENOLOCK` in the project itself. The audit below was produced by copying `package.json` to a temp dir **outside the workspace**, resolving a lockfile there (`npm install --package-lock-only`, nothing was installed into the project, no project file was modified), and running `npm audit --json` against it. That audit therefore reflects a **fresh in-range resolution** ("wanted" versions, e.g. next 15.5.29), not the exact installed tree (next 15.5.23 etc.). All installed versions fall inside the same advisory ranges, so the conclusions transfer; an exact audit becomes possible once a lockfile is committed.
- Local `node_modules` versions are ahead of `package.json` ranges in several places (e.g. next installed 15.5.23 vs range `^15.4.1`) — the `^` ranges have been silently pulling newer minors on reinstall.
- drizzle-orm 0.45.4's changelog content was not individually reviewable (raw fetch failed); 0.45.2 and 0.45.3 were reviewed directly, and npm's dist-tag confirms 0.45.4 is latest stable.
- The "Next 15 support ended Oct 21, 2026" claim is from a third-party blog; it is corroborated *indirectly* by npm advisory data (no fixed 15.x version exists for the bundled-postcss advisory — see §3.2).

---

## 2. `npm outdated --json` — installed vs wanted vs latest (2026-11-13)

| Package | package.json | Installed (node_modules) | Wanted (in-range) | Latest | Note |
|---|---|---|---|---|---|
| next | ^15.4.1 | 15.5.23 | 15.5.29 | **16.4.6** | new major exists; in-range patch behind |
| react / react-dom | ^19.1.0 | 19.2.8 | 19.3.1 | **19.3.1** | minor bump |
| @types/react, @types/react-dom | ^19.1.0 | 19.2.18 / 19.2.4 | 19.3.0 | 19.3.0 | |
| drizzle-orm | ^0.44.2 | 0.44.7 | 0.44.7 | **0.45.4** | **security fix lives here** (§3.2) |
| drizzle-kit | ^0.31.2 | 0.31.10 | 0.31.11 | 0.31.11 | patch |
| postgres | ^3.4.9 | 3.4.9 | 3.4.9 | **4.1.1** | new major; defer (§5) |
| jose | ^6.2.9 | 6.2.9 | 6.2.17 | 6.2.17 | patch bump |
| tailwindcss, @tailwindcss/postcss | ^4.1.10 | 4.3.3 | 4.3.5 | 4.3.5 | patch |
| eslint | ^9.27.0 | 9.39.5 | 9.39.5 | **10.15.0** | new major; defer (§5) |
| eslint-config-next | ^15.4.1 | 15.5.23 | 15.5.29 | **16.4.6** | follows next |
| typescript | ^5.8.3 | 5.9.3 | 5.9.3 | **7.0.2** | new major (native compiler era); defer (§5) |
| tsx | ^4.19.4 | 4.23.12 | 4.23.15 | 4.23.15 | patch |
| dotenv | ^16.5.0 | 16.6.1 | 16.6.1 | **18.0.10** | new major; defer (§5) |
| @types/node | ^22.15.0 | 22.20.1 | 22.20.5 | 26.6.6 | **mismatch**: runtime is Node 24 → use ^24.19.2 |
| postcss (direct) | ^8.5.4 | 8.5.26 | 8.5.32 | 8.5.32 | direct copy is fine; the vulnerable copy is next's nested one |
| @next/swc-wasm-nodejs (dev) | 15.4.1 (pinned) | 15.4.1 | 15.4.1 | 16.4.6 | **version-mismatched** with installed next; see §4 |

Latest-stable dist-tags confirmed via `npm view` against the registry: next 16.4.6, react 19.3.1, drizzle-orm 0.45.4 (stable; 1.0.0-rc.5 exists as prerelease), postgres 4.1.1, jose 6.2.17, tailwindcss 4.3.5.

---

## 3. `npm audit --json` — 13 vulnerabilities (0 critical, 2 high, 11 moderate)

### 3.1 The two HIGH advisories

**H1 — drizzle-orm: SQL injection via improperly escaped SQL identifiers** (direct dependency)
- Advisory: [GHSA-gpj5-g38j-94v9](https://github.com/advisories/GHSA-gpj5-g38j-94v9) · CWE-89 · CVSS 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N) · vulnerable range `<0.45.2`
- Upstream fix, confirmed on the drizzle releases page: **0.45.2** — *"Fixed `sql.identifier()`, `sql.as()` escaping issues. Previously all the values passed to these functions were not properly escaped causing a possible SQL Injection (CWE-89) vulnerability"* ([github.com/drizzle-team/drizzle-orm/releases](https://github.com/drizzle-team/drizzle-orm/releases))
- **Non-major fix?** Effectively yes: 0.44 → 0.45 is a minor-feature bump in drizzle's own versioning; npm only labels it "major" because of 0.x semver rules (`^0.44.2` can never reach 0.45.x). No breaking changes for this project's usage in 0.45.x (§4.1).
- Practical exposure here: depends on whether `sql.identifier()`/`sql.as()` are called with user-influenced values; the advisory is blanket and the bump is cheap, so fix regardless.

**H2 — postcss bundled inside next (4 advisories, 2 rated high by npm)**
- [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) (high, 7.5, arbitrary file read via attacker-controlled `sourceMappingURL` in CSS comments, ≤8.5.11) and [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) (high, 7.5, path traversal in previous source-map auto-loading, ≤8.5.17); plus GHSA-qx2v-qp2m-jg93 (moderate, XSS via unescaped `</style>` in stringify output) and GHSA-fxqj-rqcc-2cmp (moderate, incomplete fix of GHSA-6g55).
- Vulnerable node: `node_modules/next/node_modules/postcss` (≤8.5.22) — **not** the project's direct postcss 8.5.26, which is above all fixed thresholds.
- **Non-major fix? No.** npm computes `fixAvailable: next@16.4.6 (isSemVerMajor: true)`; the advisory range is `next 9.3.4-canary.0 – 16.3.0-preview.10`, i.e. **no 15.x release fixes it**. Only Next ≥16.4 clears it.
- Practical exposure: these require postcss to *process attacker-controlled CSS*. This site's CSS is first-party (Tailwind v4 + `src/app/globals.css`), so real-world risk is low — but it is the only finding that forces a major, and it stacks with the Next 15 support-window issue (§4.4), which is why Phase 2 is recommended "now-ish" rather than "someday".

### 3.2 Moderate advisories and non-major fix availability

| Finding | Severity | Path | Fix available (non-major)? |
|---|---|---|---|
| esbuild dev-server request forgery [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) (≤0.24.2) | moderate | `@esbuild-kit/*` → `drizzle-kit` (dev-only) | **No** within drizzle-kit 0.31.x. npm's suggested "fix" is downgrading drizzle-kit to 0.18.1 — reject (that's a year-old version). Dev-only tool that bundles config/seed files; the vulnerable esbuild dev server is never run. **Accept.** |
| minimatch glob-parts DoS [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) (≥7 <11.0.1) | moderate | `@typescript-eslint/typescript-estree` (dev-only) | **Yes** (`fixAvailable: true`) — covered by `npm audit fix` after Phase 1 |
| @typescript-eslint plugin/parser/utils/type-utils/estree chain | moderate ×5 | dev-only, via minimatch above | **Yes** — same |
| next (moderate) | moderate | flagged via its bundled postcss | only via Next 16 (H2) |

No advisories at all for: react/react-dom, jose, postgres, tailwindcss, @tailwindcss/postcss, tsx, dotenv, typescript, eslint.

---

## 4. Latest stable & upgrade safety (next / react / drizzle-orm / tailwind)

### 4.1 drizzle-orm — latest stable 0.45.4 → **upgrade now (Phase 1)**

- 0.45.2 = the security fix (§3.1). 0.45.3 = Netlify DB driver addition only ([changelog](https://github.com/drizzle-team/drizzle-orm/blob/main/changelogs/drizzle-orm/0.45.3.md)). 0.45.4 = latest stable, Oct 8 2026 per [gitwatchman tracker](https://www.gitwatchman.com/track/drizzle-team/drizzle-orm) (content not individually reviewed — see caveat §1).
- **Where the real breaking changes are:** the [releases page](https://github.com/drizzle-team/drizzle-orm/releases) shows the **1.0.0-rc line** carries them — *"⚠️ BREAKING CHANGE: Removed RQBv1 (`db._query`) from postgres"* and *"⚠️ BREAKING CHANGE: Reworked casing API — moved casing control from `db` instance to `table`/`view`/`schema`"*. **These are NOT in 0.45.x.**
- **This project's usage is unaffected by either rc change:** no `db.query` / `casing` usage anywhere in `src/**` (grep, 2026-11-13, zero matches). The app uses `drizzle(client, { schema })` + core query builder over `drizzle-orm/postgres-js` (`src/lib/db.ts:1-9`).
- Verdict: `0.44.7 → ^0.45.4` is a safe, necessary bump. Do **not** adopt 1.0.0-rc.

### 4.2 React — latest stable 19.3.1 → **safe minor bump**

- [React 19.3 announcement](https://react.dev/blog/2026/09/09/react-19-3) (Sep 9, 2026): View Transitions, Fragment Refs, `browser()`, Trusted Types — additive features; React minors do not break within a major.
- Peer-range check (npm view, 2026-11-13): both `next@15.5.29` and `next@16.4.6` declare `react: ^18.2.0 || 19.0.0-rc… || ^19.0.0` → react 19.3.1 satisfies **both**, so the react bump is independent of the Next major decision.
- `@types/react(-dom)` move to 19.3.0 in lockstep.

### 4.3 Next — in-range 15.5.29 is zero-risk; 16.4.6 is the real decision

**15.4 → 15.5 (in-major):** no breaking changes. [Next.js 15.5 blog](https://nextjs.org/blog/next-15-5) (Aug 18, 2025) ships Turbopack builds (beta, opt-in), stable Node.js middleware, typed routes, and **deprecation warnings** for things removed in 16 — the project already avoids all of them:
- `next lint` deprecated → project's lint script is already `eslint .` (package.json), with flat `eslint.config.mjs`.
- `<Link legacyBehavior>` → not used (grep: zero matches).
- AMP → not used (grep: zero matches).
- `images.qualities` requirement for `quality≠75` → **already configured**: `next.config.ts:8` sets `images: { unoptimized: true, qualities: [85] }` (the config comment even says "required config from Next.js 16").
- query-string local image srcs (`images.localPatterns`) → moot while `images.unoptimized: true` disables the optimizer entirely.
The project is already *running* 15.5.23 from the `^15.4.1` range, so 15.5.29 is a pure patch step-up.

**15 → 16 (new major, [Next.js 16 blog](https://nextjs.org/blog/next-16), Oct 21 2025):** relevant breaking changes vs this codebase, each verified in-repo:

| Next 16 change | This project | Evidence |
|---|---|---|
| Async `params`/`searchParams`/`cookies()`/`headers()` mandatory | **Already compliant** — every dynamic route handler uses `{ params }: { params: Promise<{ id }> }` + `await params`; auth uses `await cookies()` | `src/app/api/forum/[id]/route.ts:20-22` (+7 more handlers), `src/lib/auth.ts:71,80,92`; page-level `searchParams` prop not used (client `useSearchParams()` hook only, `src/app/login/page.tsx:22`) |
| `middleware.ts` → `proxy.ts` | **N/A** — no middleware file exists | find `{middleware,proxy}.ts` → none |
| Turbopack default bundler (`next build --webpack` escape hatch) | **Low risk** — no custom webpack config in `next.config.ts`; Tailwind v4 via `@tailwindcss/postcss` is the supported modern path. Watch: CSS concatenation order can differ from webpack ([15.5 blog "Known Differences"](https://nextjs.org/blog/next-15-5)); `next/font/google` (`src/app/layout.tsx:2`) is supported under Turbopack — verify fonts render | `next.config.ts` (whole file, minimal) |
| `images.qualities` default `[75]` | **Already handled** — `qualities: [85]` set | `next.config.ts:8` |
| `revalidateTag()` requires second `cacheLife` arg / `updateTag()` | **N/A** — `revalidateTag`/`unstable_cache` not used anywhere | grep: zero matches |
| Parallel routes require `default.js` | **N/A** — no `@slot` directories | find `src/app/**/@*` → none |
| `next lint` removed; `next build` no longer lints | **Already compliant** (`eslint .` script) | package.json |
| Node ≥20.9, TS ≥5.1 | Node 24.20.0, TS 5.9.3 | exec node --version; package.json |
| AMP/runtimeConfig/devIndicators removals, scroll-behavior opt-in | **N/A** | grep/find: zero matches |
| Dev/build separate output dirs; single-instance lockfile | Minor DX note only | blog table |

**Worth it now vs later?** Yes — as Phase 2, right after Phase 1 verifies clean. Reasons: (a) it is the **only** fix path for the two HIGH postcss advisories (§3.1); (b) the migration surface for this codebase is near-zero (table above — every removed feature is already absent); (c) 16.4.6 is a ~1-year-mature patch line (16.0 Oct 2025 → 16.4.6). Counter-pressure: nothing here is urgent enough to skip Phase 1 verification first.

### 4.4 tailwindcss / @tailwindcss/postcss — latest 4.3.5 → safe patch bump

npm dist-tag `latest = 4.3.5` vs installed 4.3.3; v4-line patch/minor, no breaking changes affecting the `@tailwindcss/postcss` + PostCSS 8 setup. Lowest-risk item in the plan.

---

## 5. Platform health

### (a) Supabase Postgres + postgres.js — **healthy; keep the current pattern**

- The client is already shaped exactly as Supabase recommends for serverless + transaction pooler: `prepare: false`, small pool (`max: 3`), `idle_timeout: 20`, `max_lifetime: 300`, `connect_timeout: 10`, module-level/globalThis-cached singleton, and an automatic rewrite of session-pooler URLs (5432) to the **transaction pooler (6543)** after hitting `EMAXCONNSESSION` (`src/lib/db.ts:37-71`).
- Official docs confirm the port model: 5432 = direct / session pooler, 6543 = transaction (dedicated/shared) pooler ([Connect to your database — Supabase Docs](https://supabase.com/docs/guides/database/connecting-to-postgres)). Supabase staff discussion confirms transaction-mode Supavisor does not support prepared statements, i.e. `prepare:false` is the documented compatibility path ([supabase/discussions #28239](https://github.com/orgs/supabase/discussions/28239)).
- npm audit reports **no advisories** for `postgres` 3.4.x. **postgres 4.1.1 is a new major with an evidence gap**: the [GitHub releases page](https://github.com/porsager/postgres/releases) lists only releases up to **v3.4.7** — no v4 release notes exist there to review breaking changes against — while npm's dist-tag serves 4.1.1. Recommendation: **stay on ^3.4.9** (§6 Phase 3); the current setup is documented-working and advisory-free.

### (b) exaroton API v1 — **no deprecation signals; one docs-vs-code discrepancy to watch**

- Docs are live and current at [developers.exaroton.com](https://developers.exaroton.com/) (fetched 2026-11-13): base URL still `https://api.exaroton.com/v1`, same Bearer-token auth, same status-code enum (0–10) the project maps in `src/lib/exaroton.ts:58-70`. No v2 or deprecation notice found.
- **Discrepancy:** the docs document server control as **GET** — `GET /servers/{server}/start/`, `GET /servers/{server}/stop/`, `GET /servers/{server}/restart/` (docs §Server actions) — while the project calls **POST** for start/stop (`src/lib/exaroton.ts:21-55`). POST has evidently been functioning in production, but if start/stop ever starts returning 405, flip the method to GET first.
- No published numeric rate-limit was found in the fetched docs; the project's defenses (single status request per poll, 30s telemetry cache, 8s `AbortSignal.timeout`, body-cancel on error — `src/lib/exaroton.ts:115-141`, `src/lib/server-telemetry.ts:4-8,45-59`) are conservative and match the docs' guidance to avoid polling loops. Future option: the docs now advertise a **websocket API** (`/v1/servers/{server}/websocket`) for push-based status — a possible follow-up to reduce polling entirely (out of scope here).

### (c) Vercel Node 24 runtime with Next 15 — **healthy; platform handles patching**

- Node.js 24 is Vercel's current default line ([Vercel changelog — Sandbox defaults to Node 24, Jan 14 2026](https://vercel.com/changelog/node-js-runtime-now-defaults-to-version-24-for-vercel-sandbox)); the Oct 21, 2026 Node security releases (incl. the Brotli decoder RCE fix) for 22.x/24.x/26.x are patched by Vercel automatically on the runtimes ([Vercel Node.js security bulletin, Oct 28 2026](https://vercel.com/kb/bulletin/node-js-security-advisory)). Local dev Node v24.20.0 matches the deployment runtime.
- Next 15 supports Node ≥18.18; Next 16 requires ≥20.9 — no constraint either way.
- **Support-window note:** a third-party report states Vercel's policy keeps each Next major in Maintenance LTS for two years, putting **Next 15's support end at Oct 21, 2026** ([digitalapplied.com, Oct 20 2026](https://www.digitalapplied.com/blog/nextjs-15-end-of-support-october-21-upgrade-options) — *secondhand source*). Corroborating data point from the first-party npm advisory DB: the bundled-postcss advisory has **no fixed 15.x version** (fix only in 16.4.6). Together: don't sit on 15.x indefinitely → Phase 2.

### (d) jose 6.x — **no known CVEs affecting 6.x**

- npm audit: zero advisories for jose in the resolved tree. Upgrading 6.2.9 → 6.2.17 is an in-range patch with no security driver, just freshness.
- Web search for "jose CVE 2025/2026" returns only same-named packages in other ecosystems: Python `joserfc` auth-bypass CVE-2026-62995 ([SentinelOne DB](https://www.sentinelone.com/vulnerability-database/cve-2026-62995)) and NVD CVE-2026-116587 for a JS JOSE implementation "fixed in version 4.1.6" ([NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-116587)) — version lines that predate/parallel but do not match panva/jose 6.x. The [panva/jose security page](https://github.com/panva/jose/security) lists no published advisories (page renders via JS; fetched listing came back empty — treat as *no published advisories*, medium confidence, backed primarily by the npm audit result).

---

## 6. Update plan

### Phase 1 — in-range security & patch updates (do now; no code changes expected)

```bash
# 1) Security-critical: drizzle (clears the HIGH SQL-injection advisory)
npm install drizzle-orm@^0.45.4
npm install -D drizzle-kit@^0.31.11

# 2) Framework in-major: Next 15.5.29 + matching eslint config (pure patch step-up)
npm install next@^15.5.29 eslint-config-next@^15.5.29

# 3) React minor + aligned types (@types/node to the 24 line to match the Vercel runtime)
npm install react@^19.3.1 react-dom@^19.3.1
npm install -D @types/react@^19.3.0 @types/react-dom@^19.3.0 @types/node@^24.19.2

# 4) Library patches
npm install jose@^6.2.17
npm install -D tailwindcss@^4.3.5 @tailwindcss/postcss@^4.3.5 postcss@^8.5.32 tsx@^4.23.15

# 5) SWC wasm fallback (pinned 15.4.1, mismatched with next 15.5.x; unused on
#    Windows x64 + Vercel, which use native SWC binaries):
npm uninstall @next/swc-wasm-nodejs
#    If any build later fails with an SWC-binding error, re-add in lockstep instead:
#    npm install -D @next/swc-wasm-nodejs@15.5.29

# 6) Sweep non-major dev-chain fixes (minimatch / @typescript-eslint), then review
npm audit fix
npm audit
```

Expected `npm audit` residue after Phase 1: the drizzle-kit→esbuild dev chain (moderate, no fix, accepted) + the next-bundled postcss findings (cleared only by Phase 2). **Commit the generated `package-lock.json`** — its absence is what blocked `npm audit` in-repo and makes installs non-reproducible.

**Phase 1 verification (in order):**
1. `npx tsc --noEmit` — type check.
2. `npm run lint` — eslint 9 + eslint-config-next 15.5.29.
3. `npm run build` — production build.
4. `npm run dev`, then smoke: `/` (hero image still renders — quality 85), `/login` (Discord OAuth redirect; exercises jose), `/forum` (DB-backed list — proves postgres.js → Supabase **transaction pooler** connectivity end-to-end), `/status` + `/api/status` (exaroton live status), admin panel → server start/stop (exaroton control; watch for 405 → GET per §5b).
5. `npm run db:generate` and check `git status` — confirm drizzle-kit 0.31.11 produces **no unexpected migration diffs** (should be a no-op against the current schema).
6. Deploy the branch, check the Vercel preview (function logs free of pooler errors, e.g. `EMAXCONNSESSION`), then promote.

### Phase 2 — Next 16 major (separate commit/PR, immediately after Phase 1 is verified)

```bash
# Automated (recommended; runs the official codemods):
npx @next/codemod@canary upgrade latest

# …or manual:
npm install next@^16.4.6 eslint-config-next@^16.4.6
# react 19.3.1 from Phase 1 already satisfies next 16's peer range.
# If @next/swc-wasm-nodejs was kept: bump it to ^16.4.6 in lockstep.
```

Pre-migration checklist: **already green** (async params ✓, `await cookies()` ✓, no middleware ✓, `images.qualities` ✓, flat eslint config ✓, no `revalidateTag` ✓, no AMP/legacyBehavior/parallel-routes ✓, Node 24 ✓, TS ≥5.1 ✓). Things to actually watch during this migration:
- **Turbopack is now the default bundler** — first `next build` may surface CSS-ordering differences vs webpack; escape hatch `next build --webpack` exists if something regresses.
- Verify `next/font/google` (Space_Grotesk) fonts render under Turbopack.
- `next build` will no longer run linting — lint explicitly in CI if desired.
- Re-run `npm audit`: the two HIGH postcss findings should now be gone; only the accepted drizzle-kit/esbuild dev-chain moderate should remain.

### Phase 3 — deferred majors (no security driver; revisit deliberately)

| Package | Latest | Why deferred |
|---|---|---|
| postgres | 4.1.1 | v4 changes are **not documented** on GitHub releases (only ≤3.4.7); current 3.4.9 + `prepare:false` is advisory-free and Supabase-proven. Revisit when v4 changelog exists. |
| eslint | 10.15.0 | Major; no advisories on 9.39.5. Pair with a Next 16 follow-up if desired (`eslint-config-next@16` defaults to flat config — project already flat). |
| typescript | 7.0.2 | The native-compiler era; project on 5.9.3 works, no advisories. Separate evaluation. |
| dotenv | 18.0.10 | Major; 16.6.1 fine, no advisories. |
| drizzle-orm 1.0.0-rc | rc.5 | **Do not adopt** — removes RQB v1 and reworks the casing API (§4.1). Wait for stable + a migration guide. |

---

## 7. Evidence register (all accessed 2026-11-13)

**First-party / authoritative:**
- npm registry (`npm outdated --json`, `npm audit --json`, `npm view`) — run this session; audit via temp-dir lockfile (§1 caveat)
- `package.json`, `next.config.ts:8`, `src/lib/db.ts:37-71`, `src/lib/exaroton.ts:8,21-55,115-141`, `src/lib/server-telemetry.ts:4-8,45-59`, `src/app/api/forum/[id]/route.ts:20-22`, `src/lib/auth.ts:71`, `src/app/layout.tsx:2`, `eslint.config.mjs`, plus grep/find verifications cited inline
- Next.js 16 release: https://nextjs.org/blog/next-16 (Oct 21, 2025)
- Next.js 15.5 release: https://nextjs.org/blog/next-15-5 (Aug 18, 2025)
- Next.js 16 upgrade guide: https://nextjs.org/docs/app/guides/upgrading/version-16
- React 19.3: https://react.dev/blog/2026/09/09/react-19-3 · versions: https://react.dev/versions
- drizzle-orm releases (0.45.2 security fix; 1.0.0-rc breaking changes): https://github.com/drizzle-team/drizzle-orm/releases · 0.45.3 changelog: https://github.com/drizzle-team/drizzle-orm/blob/main/changelogs/drizzle-orm/0.45.3.md
- Advisories (from npm audit payload): https://github.com/advisories/GHSA-gpj5-g38j-94v9, GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849, GHSA-qx2v-qp2m-jg93, GHSA-fxqj-rqcc-2cmp, GHSA-67mh-4wv8-2f99, GHSA-g3hv-75wg-m249
- exaroton API v1 docs: https://developers.exaroton.com/
- Supabase connection docs: https://supabase.com/docs/guides/database/connecting-to-postgres · prepared statements on transaction pooler: https://github.com/orgs/supabase/discussions/28239
- Vercel Node 24 sandbox default: https://vercel.com/changelog/node-js-runtime-now-defaults-to-version-24-for-vercel-sandbox · Node security bulletin: https://vercel.com/kb/bulletin/node-js-security-advisory
- panva/jose security page: https://github.com/panva/jose/security
- postgres.js releases (≤v3.4.7 listed): https://github.com/porsager/postgres/releases

**Secondhand (corroborating, lower tier):**
- Next 15 support end Oct 21 2026: https://www.digitalapplied.com/blog/nextjs-15-end-of-support-october-21-upgrade-options (Oct 20, 2026)
- drizzle 0.45.4 date: https://www.gitwatchman.com/track/drizzle-team/drizzle-orm (Oct 8, 2026)
- jose-family CVEs in other ecosystems: https://nvd.nist.gov/vuln/detail/CVE-2026-116587 · https://www.sentinelone.com/vulnerability-database/cve-2026-62995
- Vercel Node 24 functions default (field notes): https://dev.to/ahmed_mahmoud360/nodejs-20-end-of-life-on-vercel-migrating-to-node-24-field-notes-52j3 (Nov 3, 2026)
