// SERVER-ONLY. What "Your email" shows, for the website (GET /api/mailboxes)
// and the iPhone app (GET /api/mobile/mailboxes): the user's mailboxes
// without tokens or cursors, which providers can be connected right now,
// and the per-user limit. One builder so the two answers can't drift.

import type { MobileMailboxes } from "@/lib/mobile/types";
import { configuredProviders } from "./providers";
import { CONNECTION_LIMIT, listConnections, toSummary } from "./store";

export async function loadMailboxList(userId: string): Promise<MobileMailboxes> {
  const connections = (await listConnections(userId)).map(toSummary);
  return { connections, providers: configuredProviders(), limit: CONNECTION_LIMIT };
}
