// DELETE /api/accounting/fortnox[?org=<organizationId>] — disconnects a
// company's Fortnox: the row goes (tokens with it) and the grant is revoked
// at Fortnox (best effort). Proposals and posted vouchers stay: what is in
// Fortnox stays in Fortnox. Same rights as connecting.
//
// GET  /api/accounting/fortnox[?org=…] — the connection as shown in
// Settings and on a client's page: status and Fortnox company, never tokens.

import { NextResponse, type NextRequest } from "next/server";
import { decryptAccountingToken } from "@/lib/accounting/crypto";
import { forgetContext } from "@/lib/accounting/fortnox/context";
import { fortnoxConfigured, revokeRefreshToken } from "@/lib/accounting/fortnox/oauth";
import { AccountingAccessError, resolveOrganization } from "@/lib/accounting/permissions";
import { AccountingStoreError, deleteConnection, getConnection } from "@/lib/accounting/store";
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
