// DELETE /api/accounting/fortnox[?org=<organizationId>] — disconnects a
// company's Fortnox: the row goes (tokens with it) and the grant is revoked
// at Fortnox (best effort). Proposals and posted vouchers stay: what is in
// Fortnox stays in Fortnox. Same rights as connecting.
//
// GET  /api/accounting/fortnox[?org=…] — the connection as shown in
// Settings and on a client's page: status and Fortnox company, never tokens.
//
// PATCH /api/accounting/fortnox[?org=…] { confirm: true } — a person
// confirms the connected Fortnox company is this company ("Book into
// <company> (<org number>)?"), needed when UnReceipt knew no org number to
// check it against. The company's org number is then filled in from Fortnox
// when it was empty, so a later reconnect is checked automatically.

import { NextResponse, type NextRequest } from "next/server";
import { decryptAccountingToken } from "@/lib/accounting/crypto";
import { forgetContext } from "@/lib/accounting/fortnox/context";
import { fortnoxConfigured, revokeRefreshToken } from "@/lib/accounting/fortnox/oauth";
import { AccountingAccessError, resolveOrganization } from "@/lib/accounting/permissions";
import { AccountingStoreError, confirmConnection, deleteConnection, getConnection } from "@/lib/accounting/store";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";
import { isSameHost } from "@/lib/same-origin";
import { getServerUser } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function resolve(request: NextRequest) {
  const user = await getServerUser();
  if (!user) return { error: json({ error: "unauthorized" }, 401) } as const;
  try {
    const resolved = await resolveOrganization(user.id, request.nextUrl.searchParams.get("org"));
    if (!resolved) return { error: json({ error: "not_found" }, 404) } as const;
    return { user, ...resolved } as const;
  } catch (err) {
    if (err instanceof AccountingAccessError) return { error: json({ error: "server_error" }, 500) } as const;
    throw err;
  }
}

export async function GET(request: NextRequest) {
  const r = await resolve(request);
  if ("error" in r) return r.error;
  if (!fortnoxConfigured()) return json({ configured: false, connection: null });
  try {
    const conn = await getConnection(r.organizationId);
    return json({
      configured: true,
      connection: conn
        ? {
            status: conn.status,
            companyName: conn.company_name,
            orgNumber: conn.company_org_number,
            confirmed: Boolean(conn.confirmed_at),
            connectedAt: conn.created_at,
          }
        : null,
    });
  } catch (err) {
    if (err instanceof AccountingStoreError) return json({ error: "server_error" }, 500);
    throw err;
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) return json({ error: "forbidden" }, 403);
  const r = await resolve(request);
  if ("error" in r) return r.error;

  const limited = await rateLimit("accountingConnect", r.user.id);
  if (!limited.ok) return json({ error: "rate_limited" }, 429);

  let deleted;
  try {
    deleted = await deleteConnection(r.organizationId);
  } catch (err) {
    if (err instanceof AccountingStoreError) return json({ error: "server_error" }, 500);
    throw err;
  }
  if (!deleted) return json({ ok: true, revoked: false });
  forgetContext(deleted.id);
  let revoked = false;
  try {
    revoked = await revokeRefreshToken(decryptAccountingToken(deleted.refresh_token_enc, r.organizationId));
  } catch {
    revoked = false;
  }
  return json({ ok: true, revoked });
}

export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) return json({ error: "forbidden" }, 403);
  const r = await resolve(request);
  if ("error" in r) return r.error;
  const limited = await rateLimit("accountingSettings", r.user.id);
  if (!limited.ok) return json({ error: "rate_limited" }, 429);
  const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
  if (body?.confirm !== true) return json({ error: "bad_request" }, 400);
  try {
    const conn = await confirmConnection(r.organizationId, r.user.id);
    if (!conn) return json({ error: "not_connected" }, 409);
    if (conn.company_org_number) {
      const { error } = await getSupabaseAdmin()
        .from("organizations")
        .update({ org_number: conn.company_org_number })
        .eq("id", r.organizationId)
        .is("org_number", null);
      if (error) console.error("[accounting] org number pin failed", error.code);
    }
    return json({ ok: true });
  } catch (err) {
    if (err instanceof AccountingStoreError) return json({ error: "server_error" }, 500);
    throw err;
  }
}
