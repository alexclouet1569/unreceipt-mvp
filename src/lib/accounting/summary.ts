// SERVER-ONLY. What a page needs to show the Fortnox card and decide whether
// the receipt sheet shows the booking panel: is Fortnox set up for this
// deployment, and is the company connected. Never tokens. Never throws: a
// failed read shows the card as not connected (the routes check again).

import "server-only";

import { fortnoxConfigured } from "./fortnox/oauth";
import { getConnection } from "./store";

export type FortnoxSummary = {
  configured: boolean;
  connection: {
    status: "active" | "needs_reconnect";
    companyName: string | null;
    orgNumber: string | null;
    confirmed: boolean;
    /** The grant shown; confirming names it, so a reconnect meanwhile isn't confirmed blind. */
    grantId: string;
  } | null;
};

export async function loadFortnoxSummary(organizationId: string | null): Promise<FortnoxSummary> {
  const configured = fortnoxConfigured();
  if (!configured || !organizationId) return { configured, connection: null };
  try {
    const conn = await getConnection(organizationId);
    return {
      configured,
      connection: conn
        ? {
            status: conn.status,
            companyName: conn.company_name,
            orgNumber: conn.company_org_number,
            confirmed: Boolean(conn.confirmed_at),
            grantId: conn.grant_id,
          }
        : null,
    };
  } catch {
    return { configured, connection: null };
  }
}
