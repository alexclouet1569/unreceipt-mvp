<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Database

`supabase/schema.sql` is the canonical schema. Apply it by pasting into the Supabase SQL Editor; there is no migration runner in this repo.

Conventions for this file:

- All new statements must be **idempotent** — `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` followed by `CREATE POLICY`, `DROP TRIGGER IF EXISTS` followed by `CREATE TRIGGER`. Wrap `ADD CONSTRAINT` in a `DO $$ ... pg_constraint ... $$` block.
- New schema work is **appended** at the bottom under a dated header. Don't rewrite older blocks — the file's order reflects historical bootstrap order, and existing tables don't need re-running.
- One `update_updated_at()` trigger function is defined for the whole file (`CREATE OR REPLACE FUNCTION`). New tables that need it reference the same function — don't define a per-table copy.
- Tables that hold private user data get RLS enabled plus a `Users can view own ...` policy. If only a server route writes to the table (service-role key), don't add INSERT/UPDATE/DELETE policies at all — leave the table writable only via the service role.

Row types live in `src/lib/types.ts` and must be kept aligned with the schema by hand.

Switch to a real migration tool (Supabase CLI under `supabase/migrations/`) once the file crosses ~30 schema-change blocks or two people are editing it concurrently.
