// SERVER-ONLY. What Settings → "Connected email" and the first-run step need:
// the user's connected mailboxes and which providers can be connected,
// read with the same store functions as GET /api/mailboxes (never the
// token or the cursor: toSummary()). Never import from a "use client" file.

import * as Sentry from "@sentry/nextjs";
import { configuredProviders } from "@/lib/mailboxes/providers";
import { CONNECTION_LIMIT, listConnections, toSummary } from "@/lib/mailboxes/store";
import { NO_PROVIDERS, anyProvider, type MailboxProviders, type MailboxView } from "./copy";

export type MailboxesData = {
  providers: MailboxProviders;
  connections: MailboxView[];
  limit: number;
  /** The list couldn't be read: the section says so instead of showing none. */
  failed: boolean;
};

/** Which providers can be connected now. Reads env only, never throws. */
export function loadMailboxProviders(): MailboxProviders {
  try {
    return configuredProviders();
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "providers" } });
    return NO_PROVIDERS;
  }
}

/**
 * Best effort: a failed read leaves the section with an error line rather
 * than breaking Settings. Mailboxes already connected are listed (and can
 * be disconnected) even if their provider has since been switched off.
 */
export async function loadMailboxes(userId: string): Promise<MailboxesData> {
  const providers = loadMailboxProviders();
  let connections: MailboxView[] = [];
  let failed = false;
  try {
    connections = (await listConnections(userId)).map(toSummary);
  } catch (err) {
    // No provider configured usually means no table either (preview, dev):
    // say nothing then.
    if (anyProvider(providers)) {
      console.error("[/app/settings] mailbox list failed", err);
      Sentry.captureException(err, { tags: { area: "mailboxes", step: "settings_list" } });
      failed = true;
    }
  }
  return { providers, connections, limit: CONNECTION_LIMIT, failed };
}

/**
 * The connected addresses, for the first-run step and the empty inbox.
 * Best effort and quiet: on an error those screens just offer to connect.
 */
export async function loadConnectedEmails(userId: string): Promise<string[]> {
  try {
    return (await listConnections(userId)).map((c) => c.email);
  } catch (err) {
    console.error("[/app] mailbox list failed", err);
    return [];
  }
}
