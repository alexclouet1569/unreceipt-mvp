// GET /api/mobile/forwarding — what the iPhone app's forwarding guide needs
// (mobile/src/app/(app)/account/forwarding.tsx): the receipt address, the
// provider to start on, the user's own inboxes, and the button names, words
// and links from the website's guide, so they live in one place
// (guide/ui-labels.ts, src/lib/forwarding-filters.ts). The Gmail code and
// the test email are polled from GET /api/forwarding/status, as on the web.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { buildForwardingAddress, getOrCreateAliasForUser } from "@/lib/email-alias";
import { listExtraAddresses, MAX_EXTRA_ADDRESSES } from "@/lib/owner-addresses";
import {
  RECEIPT_SUBJECT_WORDS,
  gmailFilterQuery,
  icloudRuleWords,
  outlookSubjectWords,
} from "@/lib/forwarding-filters";
import { PROVIDER_LINKS, providerForEmail } from "@/lib/forwarding-providers";
import { GMAIL, ICLOUD, OUTLOOK, PHONE, type UiLabel } from "@/app/app/(authed)/settings/forwarding/guide/ui-labels";
import type { MobileForwarding, MobileMailLabel } from "@/lib/mobile/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function labels(map: Record<string, UiLabel>): Record<string, MobileMailLabel> {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, { en: v.en, sv: v.sv, fr: v.fr }]));
}

export async function GET() {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  try {
    const [aliasHash, extra] = await Promise.all([getOrCreateAliasForUser(user.id), listExtraAddresses(user.id)]);
    const suggested = providerForEmail(user.email);
    const body: MobileForwarding = {
      address: aliasHash ? buildForwardingAddress(aliasHash) : null,
      suggested: suggested === "other" ? null : suggested,
      ownAddresses: { signIn: user.email ?? "", extra, max: MAX_EXTRA_ADDRESSES },
      labels: { gmail: labels(GMAIL), outlook: labels(OUTLOOK), icloud: labels(ICLOUD), phone: labels(PHONE) },
      gmailFilter: gmailFilterQuery(),
      outlookWords: outlookSubjectWords(),
      icloudWords: { en: icloudRuleWords("en"), sv: icloudRuleWords("sv"), fr: icloudRuleWords("fr") },
      allWords: [...RECEIPT_SUBJECT_WORDS],
      links: { ...PROVIDER_LINKS },
    };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (err) {
    console.error("[/api/mobile/forwarding] failed", err);
    Sentry.captureException(err, { tags: { area: "mobile forwarding" } });
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
