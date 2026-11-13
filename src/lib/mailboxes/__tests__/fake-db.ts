// Test helper (not a test file): an in-memory stand-in for the parts of the
// Supabase query builder the mailbox code uses. Honours the column list of
// select() (so a test can see that a column never comes back), insert /
// update / delete with `.select()` returning, count+head, eq / is / lt,
// maybeSingle / single, and the unique indexes of the 2026-11-13 schema
// block (23505 like Postgres).

import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Op = "select" | "insert" | "update" | "delete";
type DbError = { code: string; message: string } | null;

const UNIQUES: Record<string, Array<(r: Row) => string | null>> = {
  mailbox_connections: [
    (r) => `${r.user_id}|${r.provider}|${String(r.email).toLowerCase()}`,
  ],
  mailbox_oauth_pending: [
    (r) => `nonce|${r.nonce}`,
    (r) => (r.link_jti ? `jti|${r.link_jti}` : null),
  ],
  mailbox_oauth_parked: [(r) => `code|${r.code_hash}`],
};

const DEFAULTS: Record<string, () => Row> = {
  mailbox_connections: () => {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      status: "active",
      cursor: null,
      watch_id: null,
      watch_expires_at: null,
      last_sync_at: null,
      last_receipt_at: null,
      last_error: null,
      created_at: now,
      updated_at: now,
    };
  },
};

export type FakeDb = {
  tables: Record<string, Row[]>;
  /** Make the next operation on `table` fail with this error. */
  failNext: Record<string, DbError>;
  client: { from: (table: string) => unknown };
};

function project(row: Row, columns: string | null): Row {
  if (!columns || columns.trim() === "*") return { ...row };
  const out: Row = {};
  for (const c of columns.split(",").map((s) => s.trim()).filter(Boolean)) out[c] = row[c];
  return out;
}

export function createFakeDb(tables: Record<string, Row[]> = {}): FakeDb {
  const db: FakeDb = { tables, failNext: {}, client: { from: (t: string) => query(t) } };

  function violates(table: string, candidate: Row, ignore: Row | null): boolean {
    const keys = UNIQUES[table] ?? [];
    return (db.tables[table] ?? []).some(
      (other) =>
        other !== ignore &&
        keys.some((k) => {
          const a = k(candidate);
          return a !== null && a === k(other);
        }),
    );
  }

  function query(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let op: Op = "select";
    let payload: unknown = null;
    let columns: string | null = null;
    let returning = false;
    let countHead = false;
    const all = () => (db.tables[table] ??= []);
    const matching = () => all().filter((r) => filters.every((f) => f(r)));

    const run = (): { data: unknown; error: DbError; count?: number | null } => {
      const injected = db.failNext[table];
      if (injected) {
        delete db.failNext[table];
        return { data: null, error: injected };
      }
      if (op === "select") {
        const hit = matching();
        if (countHead) return { data: null, error: null, count: hit.length };
        return { data: hit.map((r) => project(r, columns)), error: null };
      }
      if (op === "insert") {
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
        const rows = list.map((p) => ({ ...(DEFAULTS[table]?.() ?? {}), ...p }));
        for (const r of rows) {
          if (violates(table, r, null)) return { data: null, error: { code: "23505", message: "duplicate" } };
        }
        all().push(...rows);
        return { data: returning ? rows.map((r) => project(r, columns)) : null, error: null };
      }
      const hit = matching();
      if (op === "update") {
        for (const r of hit) {
          const next = { ...r, ...(payload as Row) };
          if (violates(table, next, r)) return { data: null, error: { code: "23505", message: "duplicate" } };
        }
        for (const r of hit) Object.assign(r, payload as Row, { updated_at: new Date().toISOString() });
      }
      if (op === "delete") db.tables[table] = all().filter((r) => !hit.includes(r));
      return { data: returning ? hit.map((r) => project(r, columns)) : null, error: null };
    };
    const one = () => {
      const res = run();
      if (res.error) return { data: null, error: res.error };
      const rows = (res.data as Row[] | null) ?? [];
      return { data: rows[0] ?? null, error: null };
    };

    const q: Record<string, unknown> = {
      select: (cols?: string, opts?: { count?: string; head?: boolean }) => {
        columns = cols ?? "*";
        if (opts?.head) countHead = true;
        if (op !== "select") returning = true;
        return q;
      },
      insert: (p: unknown) => ((op = "insert"), (payload = p), q),
      update: (p: unknown) => ((op = "update"), (payload = p), q),
      delete: () => ((op = "delete"), q),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
      lt: (c: string, v: string) => (filters.push((r) => String(r[c] ?? "") < v), q),
      order: () => q,
      limit: () => q,
      single: async () => {
        const res = one();
        if (!res.error && res.data === null) return { data: null, error: { code: "PGRST116", message: "no rows" } };
        return res;
      },
      maybeSingle: async () => one(),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  }

  return db;
}
