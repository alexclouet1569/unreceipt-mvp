// SERVER-ONLY. The provider registry: route params and stored rows name a
// provider by id; this returns its adapter. Steps 3/4 replace the stubs in
// google.ts / microsoft.ts, never this file.

import { tokenKeyConfigured } from "./crypto";
import { googleProvider } from "./google";
import { microsoftProvider } from "./microsoft";
import { isMailboxProviderId, type MailboxProvider, type MailboxProviderId } from "./types";

const REGISTRY: Record<MailboxProviderId, MailboxProvider> = {
  google: googleProvider,
  microsoft: microsoftProvider,
};

export function getProvider(id: MailboxProviderId): MailboxProvider {
  return REGISTRY[id];
}

// A provider can be connected only when its own env vars are set AND a
// token key exists to store what it returns.
const usable = (provider: MailboxProvider) => provider.configured() && tokenKeyConfigured();

/**
 * The adapter for a provider named in a request, or null when the name is
 * unknown or the provider can't be connected (both answer 404).
 */
export function configuredProvider(raw: unknown): MailboxProvider | null {
  if (!isMailboxProviderId(raw)) return null;
  const provider = REGISTRY[raw];
  return usable(provider) ? provider : null;
}

/** Which providers can be connected right now (for the UI). */
export function configuredProviders(): Record<MailboxProviderId, boolean> {
  return {
    google: usable(REGISTRY.google),
    microsoft: usable(REGISTRY.microsoft),
  };
}
