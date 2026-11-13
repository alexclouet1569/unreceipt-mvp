// SERVER-ONLY. Starts an OAuth flow for a user who is already identified
// (the website's session, or the iPhone app's link after the confirmation
// page): rate limit, the 5-mailbox cap, a pending row, the binding cookie,
// then a 303 to the provider's consent screen. Failures redirect to the
// fixed result page of the client (never a target from the request).

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  bindingCookieName,
  bindingCookieOptions,
  createPending,
  redirectUri,
  resultUrl,
  type OAuthClient,
  type ResultReason,
} from "./oauth";
import { CONNECTION_LIMIT, countConnections } from "./store";
import type { MailboxProvider } from "./types";

export function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  // The URL may carry a link token or an OAuth code: never pass it on.
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export function finishWith(client: OAuthClient, reason: ResultReason): NextResponse {
  return noStore(NextResponse.redirect(resultUrl(client, { status: "error", reason }), 303));
}

export async function startConnectFlow(input: {
  provider: MailboxProvider;
  userId: string;
  client: OAuthClient;
  linkJti?: string | null;
}): Promise<NextResponse> {
  const { provider, userId, client } = input;

  const limited = await rateLimit("mailboxConnect", userId);
  if (!limited.ok) return finishWith(client, "rate_limited");

  const supabase = getSupabaseAdmin();
  try {
    // Checked again in the callback (a reconnect of a known address is
    // allowed there even at the cap); this spares a trip to the provider.
    if ((await countConnections(userId, supabase)) >= CONNECTION_LIMIT) {
      return finishWith(client, "limit");
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "connect_count" } });
    return finishWith(client, "server_error");
  }

  const created = await createPending(supabase, {
    userId,
    provider: provider.id,
    client,
    linkJti: input.linkJti ?? null,
  });
  if (!created.ok) {
    if (created.error === "link_used") return finishWith(client, "link_used");
    Sentry.captureMessage("mailbox pending insert failed", { tags: { area: "mailboxes", step: "pending_insert" } });
    return finishWith(client, "server_error");
  }
  const { state, challenge, bindingValue } = created.pending;

  let consentUrl: string;
  try {
    consentUrl = provider.authUrl({ state, codeChallenge: challenge, redirectUri: redirectUri(provider.id) });
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "auth_url", provider: provider.id } });
    return finishWith(client, "provider_unavailable");
  }

  const res = noStore(NextResponse.redirect(consentUrl, 303));
  res.cookies.set(bindingCookieName(state), bindingValue, bindingCookieOptions());
  return res;
}
