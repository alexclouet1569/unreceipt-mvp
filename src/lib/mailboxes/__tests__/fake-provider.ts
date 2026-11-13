// Test helper (not a test file): a configurable MailboxProvider standing in
// for the Gmail adapter (vi.mock("@/lib/mailboxes/google", …)). Every
// method is a vi.fn so tests can assert calls and change answers.

import { vi } from "vitest";
import type { MailboxProvider } from "../types";

export const FAKE_AUTH_BASE = "https://accounts.example.test/o/oauth2/auth";

export function createFakeProvider() {
  const provider = {
    id: "google" as const,
    configured: vi.fn(() => true),
    authUrl: vi.fn(
      ({ state, codeChallenge, redirectUri }: { state: string; codeChallenge: string; redirectUri: string }) =>
        `${FAKE_AUTH_BASE}?${new URLSearchParams({ state, code_challenge: codeChallenge, redirect_uri: redirectUri })}`,
    ),
    exchangeCode: vi.fn(async () => ({
      refreshToken: "1//refresh-token-secret",
      accessToken: "ya29.access",
      expiresAt: Date.now() + 3600_000,
      email: "Anna@Gmail.com",
    })),
    refreshAccessToken: vi.fn(async () => ({ accessToken: "ya29.fresh", expiresAt: Date.now() + 3600_000 })),
    canRevoke: true as boolean,
    revoke: vi.fn(async () => {}),
    startWatch: vi.fn(async () => ({ watchId: null, expiresAt: "2026-11-20T00:00:00.000Z", cursor: "1000" })),
    stopWatch: vi.fn(async () => {}),
    sync: vi.fn(async () => ({ cursor: "1005", processed: 2, created: 1 })),
  };
  return provider satisfies MailboxProvider;
}

export type FakeProvider = ReturnType<typeof createFakeProvider>;

export function resetFakeProvider(p: FakeProvider): void {
  const fresh = createFakeProvider();
  for (const key of Object.keys(fresh) as Array<keyof FakeProvider>) {
    if (key === "id") continue;
    if (key === "canRevoke") {
      p.canRevoke = fresh.canRevoke;
      continue;
    }
    const fn = p[key] as unknown as { mockReset: () => void; mockImplementation: (f: unknown) => void };
    fn.mockReset();
    fn.mockImplementation((fresh[key] as unknown as { getMockImplementation: () => unknown }).getMockImplementation());
  }
}

export const fakeProvider = createFakeProvider();
