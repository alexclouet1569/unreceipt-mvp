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

# Admin auth

Defense in depth (plan decision A2):

1. **`proxy.ts`** at the project root gates `/admin/:path*` and `/api/admin/:path*` — this is the optimistic check the Vercel CDN can run cheaply. Non-admin browsers are redirected to `/app`; non-admin API callers get a 403 JSON.
2. **`requireAdmin()`** from `src/lib/require-admin.ts` is the real authorization gate. Every admin server action and every `/api/admin/*` route handler must call it before doing anything else. It re-reads the session cookie and re-checks the allowlist. Throws `AdminAuthError` on failure.

`src/lib/auth-admin.ts` exports the pure `isAdminEmail()` matcher. Both the proxy and `requireAdmin()` share it so the policy is defined once.

`src/lib/supabase-admin.ts` exposes `getSupabaseAdmin()` — a Supabase client built with the **service-role** key. This bypasses RLS and is god-mode for the database. Rules:

- Never import this file from a `"use client"` component, page, or hook.
- Never reference `SUPABASE_SERVICE_ROLE_KEY` from a `NEXT_PUBLIC_*` variable or anywhere it could end up in the client bundle.
- The file is guarded by filename + a top-of-file comment + the fact that the env var is not `NEXT_PUBLIC_*` (so an accidental client import would fail fast at runtime instead of leaking the key).

Required env vars (see `.env.example`): `SUPABASE_SERVICE_ROLE_KEY`, `CONCIERGE_ADMIN_EMAILS`.
