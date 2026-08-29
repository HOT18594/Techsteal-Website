# Migrations

`0000_initial_schema.sql` is a **baseline**, generated from `src/lib/schema.ts`
after the production database was already live. It is the schema as it stands
today, not a diff — running it against the existing Supabase database would
fail on `CREATE TABLE ... already exists`.

Its job is to give `drizzle-kit generate` a snapshot to diff future changes
against (`drizzle/meta/0000_snapshot.json`), so from here on every schema change
produces a real, reviewable migration file instead of an untracked `db:push`.

## Workflow

- Change `src/lib/schema.ts`.
- `npm run db:generate` — writes the next `NNNN_*.sql` from the diff. **Read it.**
- Apply it: `npm run db:push` (dev / this project's current practice) or run the
  SQL against the database directly.

## Fresh database

Run `0000_initial_schema.sql`, then `npm run db:seed` for the fallback content.

## Note on `members`

The old `members` demo table was dropped from the schema (nothing imported it;
the roster reads `profiles`). It is absent from this baseline, so a future
`db:push` may offer to drop the physical table if one still exists. Confirm it's
empty before accepting.
