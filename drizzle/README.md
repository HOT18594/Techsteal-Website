# Migrations

`0000_initial_schema.sql` is a **baseline**, generated from `src/lib/schema.ts`
after the production database was already live. It is the schema at the moment
the baseline was taken, not a diff — running it against the existing Supabase
database would fail on `CREATE TABLE ... already exists`.

Its job is to give `drizzle-kit generate` a snapshot to diff future changes
against (`drizzle/meta/0000_snapshot.json`), so from here on every schema change
produces a real, reviewable migration file instead of an untracked `db:push`.

## Migrations in order

| File | What it does |
| --- | --- |
| `0000_initial_schema.sql` | Baseline schema (see above) |
| `0001_gifted_the_leader.sql` | Swaps the Minecraft-name unique index for a case-insensitive one |
| `0002_puzzling_star_brand.sql` | Adds `notifications` and `audit_log` |
| `0003_cute_sunset_bain.sql` | Adds `announcements` + its active/created index |

`drizzle/meta/_journal.json` lists the same four tags; keep it and the snapshots
in sync with the SQL (they are generated — do not hand-edit).

## Workflow

- Change `src/lib/schema.ts`.
- `npm run db:generate` — writes the next `NNNN_*.sql` from the diff. **Read it.**
- Apply it: `npm run db:push` (dev / this project's current practice) or run the
  SQL against the database directly.

## Fresh database

Apply every tracked migration in order — `0000`, then `0001`, `0002`, and
`0003` — then run `npm run db:seed` for the fallback content.

`db:seed` clears the content tables first and refuses to run when they already
have rows unless you opt in with `--force` (`npm run db:seed -- --force` or
`SEED_FORCE=1 npm run db:seed`).

Note: the live Supabase database was provisioned with `db:push` and has no
`drizzle.__drizzle_migrations` journal, so these files are the fresh-database /
reference path, not a recorded applied history.

## Note on `members`

The old `members` demo table was dropped from the schema (nothing imported it;
the roster reads `profiles`). It is absent from this baseline, so a future
`db:push` may offer to drop the physical table if one still exists. Confirm it's
empty before accepting.
