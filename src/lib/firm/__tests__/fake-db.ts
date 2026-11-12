// Test helper (not a test file): a tiny in-memory stand-in for the parts
// of the Supabase query builder the firm-link routes use. Filters, insert,
// update, delete, maybeSingle/single and plain await; every write is
// logged so tests can assert what changed. `guard` lets a test refuse a
// write the way a database constraint would (e.g. 23505).

type Row = Record<string, unknown>;
type Op = "select" | "insert" | "update" | "delete";
export type FakeError = { code?: string; message?: string } | null;

export type FakeDb = {
  tables: Record<string, Row[]>;
  log: Array<{ table: string; op: Op; payload?: unknown; rows?: Row[] }>;
  guard: (table: string, op: Op, rows: Row[], payload: unknown) => FakeError;
  client: { from: (table: string) => unknown };
};

export function createFakeDb(tables: Record<string, Row[]> = {}): FakeDb {
  let nextId = 1;
  const db: FakeDb = {
    tables,
    log: [],
    guard: () => null,
    client: { from: (table: string) => query(table) },
  };

  function query(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let op: Op = "select";
    let payload: unknown = null;
    let returning = false;
    const all = () => (db.tables[table] ??= []);
    const matching = () => all().filter((r) => filters.every((f) => f(r)));

    const run = (): { data: unknown; error: FakeError } => {
      if (op === "select") return { data: matching(), error: null };
      if (op === "insert") {
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
        const rows = list.map((p) => ({ id: `${table}-${nextId++}`, ...p }));
        const error = db.guard(table, op, rows, payload);
        if (error) return { data: null, error };
        all().push(...rows);
        db.log.push({ table, op, payload, rows });
        return { data: rows, error: null };
      }
      const hit = matching();
      const error = db.guard(table, op, hit, payload);
      if (error) return { data: null, error };
      if (op === "update") for (const r of hit) Object.assign(r, payload as Row);
      if (op === "delete") db.tables[table] = all().filter((r) => !hit.includes(r));
      db.log.push({ table, op, payload, rows: hit.map((r) => ({ ...r })) });
      return { data: returning || op !== "delete" ? hit : null, error: null };
    };
    const one = () => {
      const res = run();
      if (res.error) return { data: null, error: res.error };
      const rows = res.data as Row[];
      return { data: rows[0] ?? null, error: null };
    };

    const q: Record<string, unknown> = {
      select: () => {
        if (op !== "select") returning = true;
        return q;
      },
      insert: (p: unknown) => ((op = "insert"), (payload = p), q),
      update: (p: unknown) => ((op = "update"), (payload = p), q),
      delete: () => ((op = "delete"), q),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
      not: (c: string, _o: string, v: unknown) => (filters.push((r) => (r[c] ?? null) !== v), q),
      gt: (c: string, v: string) => (filters.push((r) => String(r[c] ?? "") > v), q),
      order: () => q,
      limit: () => q,
      single: async () => one(),
      maybeSingle: async () => one(),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  }

  return db;
}
