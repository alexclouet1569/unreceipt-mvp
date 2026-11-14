import { describe, expect, it, vi } from "vitest";
import type { MobileMailboxConnection } from "@/lib/mobile/types";
import { fill } from "../../i18n/core";
import { en } from "../../i18n/en";
import { fr } from "../../i18n/fr";
import { sv } from "../../i18n/sv";
import { ApiError } from "../api-error";
import {
  addRows,
  authSessionOutcome,
  claimErrorKey,
  configuredProviders,
  connectLinkErrorKey,
  connectState,
  disconnectOutcome,
  finishOutcome,
  isWebUrl,
  onInbox,
  orderProviders,
  parseMailboxUrl,
  providerNames,
  removeAccessNote,
  putInInbox,
  reasonKey,
  relativeAgo,
  runConnect,
  statusLine,
  takeFromInbox,
  type ConnectDeps,
} from "../mailboxes";

// RESULT_REASONS in src/lib/mailboxes/oauth.ts (server code: node:crypto, so
// not importable under the app's tsconfig), plus no_access from the access
// check. Keep in step when the server adds a reason.
const RESULT_REASONS = [
  "denied",
  "admin_consent",
  "expired",
  "invalid_state",
  "wrong_browser",
  "wrong_account",
  "exchange_failed",
  "no_mailbox",
  "scope_missing",
  "limit",
  "rate_limited",
  "link_invalid",
  "link_expired",
  "link_used",
  "provider_unavailable",
  "no_access",
  "server_error",
];

const CODE = "a".repeat(20) + "B_-" + "9".repeat(20); // 43 characters, base64url
const conn: MobileMailboxConnection = {
  id: "11111111-1111-4111-8111-111111111111",
  provider: "google",
  email: "anna@gmail.com",
  status: "active",
  lastReceiptAt: null,
  lastSyncAt: null,
  createdAt: "2026-11-13T08:00:00Z",
};

describe("the redirect back to the app", () => {
  it("reads a claim with its code and provider", () => {
    expect(parseMailboxUrl(`unreceipt://mailboxes?status=claim&code=${CODE}&provider=microsoft`)).toEqual({
      kind: "claim",
      code: CODE,
      provider: "microsoft",
    });
    expect(parseMailboxUrl(`unreceipt:///mailboxes/?status=claim&code=${CODE}`)).toEqual({
      kind: "claim",
      code: CODE,
      provider: null,
    });
  });

  it("refuses a claim without a well-formed code", () => {
    expect(parseMailboxUrl("unreceipt://mailboxes?status=claim")).toEqual({ kind: "error", reason: "link_invalid" });
    expect(parseMailboxUrl("unreceipt://mailboxes?status=claim&code=short")).toEqual({
      kind: "error",
      reason: "link_invalid",
    });
    expect(parseMailboxUrl("unreceipt://mailboxes?status=claim&code=%3Cscript%3E%3C%2Fscript%3Eaaaaaaaaaaaa")).toEqual({
      kind: "error",
      reason: "link_invalid",
    });
  });

  it("reads errors and cancellations, and keeps only short fixed reason codes", () => {
    expect(parseMailboxUrl("unreceipt://mailboxes?status=error&reason=admin_consent")).toEqual({
      kind: "error",
      reason: "admin_consent",
    });
    expect(parseMailboxUrl("unreceipt://mailboxes?status=error&reason=Something%20bad")).toEqual({
      kind: "error",
      reason: "server_error",
    });
    expect(parseMailboxUrl("unreceipt://mailboxes?status=cancelled")).toEqual({ kind: "cancelled" });
    expect(parseMailboxUrl("unreceipt://mailboxes?status=connected")).toEqual({ kind: "connected" });
    expect(parseMailboxUrl("unreceipt://mailboxes?status=weird")).toEqual({ kind: "error", reason: "server_error" });
    expect(parseMailboxUrl("unreceipt://mailboxes")).toEqual({ kind: "error", reason: "server_error" });
  });

  it("the first value of a repeated parameter wins", () => {
    expect(parseMailboxUrl(`unreceipt://mailboxes?status=cancelled&status=claim&code=${CODE}`)).toEqual({
      kind: "cancelled",
    });
  });

  it("leaves every other link to the router", () => {
    expect(parseMailboxUrl("unreceipt://account")).toBeNull();
    expect(parseMailboxUrl("unreceipt://mailboxesx?status=claim")).toBeNull();
    expect(parseMailboxUrl("https://evil.example/mailboxes?status=claim")).toBeNull();
    expect(parseMailboxUrl("/receipt/123")).toBeNull();
  });

  it("turns the sign-in sheet's answer into an outcome", () => {
    expect(authSessionOutcome({ type: "success", url: "unreceipt://mailboxes?status=error&reason=denied" })).toEqual({
      kind: "error",
      reason: "denied",
    });
    expect(authSessionOutcome({ type: "success", url: "unreceipt://elsewhere" })).toEqual({
      kind: "error",
      reason: "server_error",
    });
    expect(authSessionOutcome({ type: "cancel" })).toEqual({ kind: "cancelled" });
    expect(authSessionOutcome({ type: "dismiss" })).toEqual({ kind: "cancelled" });
  });
});

describe("messages", () => {
  it("has a sentence for every reason the server can send, in every language", () => {
    for (const reason of RESULT_REASONS) {
      const key = reasonKey(reason);
      if (reason !== "server_error") expect(key, reason).not.toBe("serverError");
      for (const strings of [en, sv, fr]) expect(strings.mailboxes.errors[key]).toBeTruthy();
    }
    expect(reasonKey("something_new")).toBe("serverError");
    expect(reasonKey(null)).toBe("serverError");
    expect(reasonKey("hasOwnProperty")).toBe("serverError");
  });

  it("maps connect-link refusals", () => {
    expect(connectLinkErrorKey(404)).toBe("unavailable");
    expect(connectLinkErrorKey(409, "limit")).toBe("limit");
    expect(connectLinkErrorKey(429)).toBe("rateLimited");
    expect(connectLinkErrorKey(403, "no_access")).toBe("noAccess");
    expect(connectLinkErrorKey(500, "server_error")).toBe("serverError");
  });

  it("maps claim refusals", () => {
    expect(claimErrorKey(400, "invalid")).toBe("claimInvalid");
    expect(claimErrorKey(404, "invalid")).toBe("claimInvalid");
    expect(claimErrorKey(410, "expired")).toBe("expired");
    expect(claimErrorKey(403, "wrong_account")).toBe("wrongAccount");
    expect(claimErrorKey(403, "no_access")).toBe("noAccess");
    expect(claimErrorKey(409, "limit")).toBe("limit");
    expect(claimErrorKey(429, null)).toBe("rateLimited");
    expect(claimErrorKey(500, "server_error")).toBe("serverError");
    expect(claimErrorKey(403, "forbidden")).toBe("serverError");
  });

  it("treats a mailbox that's already gone as disconnected", () => {
    expect(disconnectOutcome(200)).toBe("gone");
    expect(disconnectOutcome(404)).toBe("gone");
    expect(disconnectOutcome(500)).toBe("failed");
  });

  it("after a disconnect that wasn't revoked, says where to remove access at the provider", () => {
    expect(removeAccessNote("microsoft", false, en.mailboxes)).toBe(
      "To remove UnReceipt’s access completely, also remove it in your Microsoft account (account.microsoft.com → Privacy → Apps; work: myapps.microsoft.com).",
    );
    expect(removeAccessNote("google", false, en.mailboxes)).toContain("myaccount.google.com/permissions");
    // Revoked, or not said (a 404: already gone): nothing to add.
    expect(removeAccessNote("google", true, en.mailboxes)).toBeNull();
    expect(removeAccessNote("microsoft", undefined, en.mailboxes)).toBeNull();
    for (const strings of [sv, fr]) {
      expect(removeAccessNote("microsoft", false, strings.mailboxes)).toContain("myapps.microsoft.com");
      expect(removeAccessNote("google", false, strings.mailboxes)).toContain("myaccount.google.com/permissions");
    }
  });

  it("explains in every language that the AI reads saved receipts and the accountant sees confirmed ones", () => {
    expect(en.mailboxes.whatWeRead).toContain("Claude AI");
    expect(en.mailboxes.whatWeRead).toContain("your accountant sees them once you’ve confirmed them");
    expect(en.mailboxes.whatWeRead).toContain("order confirmation");
    expect(sv.mailboxes.whatWeRead).toContain("Claude");
    expect(sv.mailboxes.whatWeRead).toContain("redovisningskonsult");
    expect(fr.mailboxes.whatWeRead).toContain("Claude");
    expect(fr.mailboxes.whatWeRead).toContain("expert-comptable");
    for (const strings of [en, sv, fr]) {
      // Each language names its own "To confirm" list.
      expect(strings.mailboxes.whatWeRead).toContain(strings.receipts.toConfirm);
      expect(strings.mailboxes.privacyLink.length).toBeGreaterThan(0);
    }
  });

  it("never names a price or a purchase", () => {
    for (const strings of [en, sv, fr]) {
      const all = JSON.stringify(strings.mailboxes);
      expect(all).not.toMatch(/€|\bkr\b|\bprices?\b|\bpris(et|er)?\b(?! plus)|\bprix\b|subscri|\babonn|prenumer|\btrial|période d’essai|upgrade|\bplans?\b/i);
    }
  });
});

describe("status line", () => {
  const now = Date.parse("2026-11-13T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("says how long ago, in words", () => {
    expect(relativeAgo(ago(20_000), en.mailboxes, "en", now)).toBe("just now");
    expect(relativeAgo(ago(5 * 60_000), en.mailboxes, "en", now)).toBe("5 min ago");
    expect(relativeAgo(ago(2 * 3_600_000), en.mailboxes, "en", now)).toBe("2 h ago");
    expect(relativeAgo(ago(26 * 3_600_000), en.mailboxes, "en", now)).toBe("yesterday");
    expect(relativeAgo(ago(3 * 86_400_000), en.mailboxes, "en", now)).toBe("3 days ago");
    expect(relativeAgo(ago(2 * 3_600_000), sv.mailboxes, "sv", now)).toBe("för 2 tim sedan");
    expect(relativeAgo(ago(2 * 3_600_000), fr.mailboxes, "fr", now)).toBe("il y a 2 h");
    // Older than a week: a date, in each language's own sentence.
    expect(relativeAgo(ago(20 * 86_400_000), en.mailboxes, "en", now)).toMatch(/^on 24 Oct\b/);
    expect(relativeAgo(ago(20 * 86_400_000), sv.mailboxes, "sv", now)).toMatch(/^den 24 okt/);
    expect(relativeAgo(ago(20 * 86_400_000), fr.mailboxes, "fr", now)).toMatch(/^le 24 oct/);
    expect(
      statusLine({ ...conn, lastSyncAt: ago(1), lastReceiptAt: ago(20 * 86_400_000) }, en.mailboxes, "en", now).text,
    ).toMatch(/^Checking for new receipts · last receipt on 24 Oct\b/);
    expect(relativeAgo("not a date", en.mailboxes, "en", now)).toBe("");
  });

  it("puts each state in plain words", () => {
    // The address is the row's label (two Gmail accounts are told apart by
    // it), so the status line doesn't repeat it.
    const line = (c: Partial<MobileMailboxConnection>) => statusLine({ ...conn, ...c }, en.mailboxes, "en", now);
    expect(line({})).toEqual({ text: "Setting up…", tone: "pending" });
    expect(line({ lastSyncAt: ago(60_000) })).toEqual({ text: "Checking for new receipts · none yet", tone: "ok" });
    expect(line({ lastSyncAt: ago(60_000), lastReceiptAt: ago(2 * 3_600_000) })).toEqual({
      text: "Checking for new receipts · last receipt 2 h ago",
      tone: "ok",
    });
    expect(line({ status: "needs_reconnect" })).toEqual({ text: "Reconnect needed", tone: "attention" });
    expect(line({ status: "paused" })).toEqual({
      text: "Paused: your account doesn’t have access right now, so new email isn’t read. After 30 days paused, the mailbox is disconnected.",
      tone: "attention",
    });
    for (const strings of [en, sv, fr]) {
      for (const c of [{}, { lastSyncAt: ago(1) }, { lastSyncAt: ago(1), lastReceiptAt: ago(1) }, { status: "paused" as const }]) {
        const text = statusLine({ ...conn, ...c }, strings.mailboxes, "sv", now).text;
        expect(text).not.toContain("anna@gmail.com");
        expect(text).not.toMatch(/\{\w+\}/);
      }
      expect(fill(strings.mailboxes.disconnected, { email: "anna@gmail.com" })).toContain("anna@gmail.com");
    }
  });

  it("lists configured providers Gmail first", () => {
    expect(configuredProviders({ microsoft: true, google: true })).toEqual(["google", "microsoft"]);
    expect(configuredProviders({ google: false, microsoft: true })).toEqual(["microsoft"]);
    expect(configuredProviders(null)).toEqual([]);
  });
});

describe("connect buttons", () => {
  const both = ["google", "microsoft"] as const;

  it("puts Outlook first for a Microsoft sign-in address, Gmail first otherwise", () => {
    expect(orderProviders(both, "anna@outlook.com")).toEqual(["microsoft", "google"]);
    expect(orderProviders(both, "Anna@Hotmail.SE ")).toEqual(["microsoft", "google"]);
    expect(orderProviders(both, "anna@live.fr")).toEqual(["microsoft", "google"]);
    expect(orderProviders(both, "anna@msn.com")).toEqual(["microsoft", "google"]);
    expect(orderProviders(both, "anna@gmail.com")).toEqual(["google", "microsoft"]);
    expect(orderProviders(both, "anna@firma.se")).toEqual(["google", "microsoft"]);
    // Look-alikes and other providers' addresses change nothing.
    expect(orderProviders(both, "anna@outlookalike.com")).toEqual(["google", "microsoft"]);
    expect(orderProviders(both, null)).toEqual(["google", "microsoft"]);
    // Only what's configured, never a provider that isn't.
    expect(orderProviders(["google"], "anna@outlook.com")).toEqual(["google"]);
    expect(orderProviders([], "anna@outlook.com")).toEqual([]);
  });

  it("names the providers in the app's language", () => {
    expect(providerNames(both, en.mailboxes)).toBe("Gmail or Outlook");
    expect(providerNames(["microsoft", "google"], sv.mailboxes)).toBe("Outlook eller Gmail");
    expect(providerNames(["google"], fr.mailboxes)).toBe("Gmail");
  });

  it("offers one row per provider, or Add another mailbox when only one kind can be added", () => {
    expect(addRows(both, 0)).toEqual([
      { provider: "google", label: "connectGoogle" },
      { provider: "microsoft", label: "connectMicrosoft" },
    ]);
    expect(addRows(both, 2)).toEqual([
      { provider: "google", label: "connectGoogle" },
      { provider: "microsoft", label: "connectMicrosoft" },
    ]);
    expect(addRows(["microsoft"], 0)).toEqual([{ provider: "microsoft", label: "connectMicrosoft" }]);
    expect(addRows(["google"], 1)).toEqual([{ provider: "google", label: "addAnother" }]);
    expect(addRows([], 1)).toEqual([]);
  });
});

describe("first run and empty state wait for the mailboxes", () => {
  const data = (over: Partial<{ google: boolean; microsoft: boolean; connections: MobileMailboxConnection[]; limit: number }> = {}) => ({
    providers: { google: over.google ?? true, microsoft: over.microsoft ?? true },
    connections: over.connections ?? [],
    limit: over.limit ?? 5,
  });

  it("is unknown until the list or a failure is known, so no button changes under the finger", () => {
    expect(connectState(null, null)).toBe("unknown");
    // A failure with nothing saved: the address alone, never a placeholder forever.
    expect(connectState(null, "offline")).toBe("none");
    expect(connectState(null, "server")).toBe("none");
  });

  it("offers Connect while a provider is set up and nothing is connected", () => {
    expect(connectState(data(), null)).toBe("offer");
    expect(connectState(data({ google: false }), null)).toBe("offer");
    // A saved list wins over a failed refresh.
    expect(connectState(data(), "offline")).toBe("offer");
  });

  it("says the email is connected once one is", () => {
    expect(connectState(data({ connections: [conn] }), null)).toBe("connected");
    expect(connectState(data({ google: false, microsoft: false, connections: [conn] }), null)).toBe("connected");
  });

  it("shows the address alone when nothing can be connected", () => {
    expect(connectState(data({ google: false, microsoft: false }), null)).toBe("none");
    expect(connectState(data({ limit: 0 }), null)).toBe("none");
  });
});

describe("connect flow", () => {
  const LINK = "https://app.unreceipt.com/api/mailboxes/connect/google?link=tok";
  const fakeDeps = (over: Partial<ConnectDeps> = {}): ConnectDeps => ({
    connectLink: vi.fn(async () => ({ ok: true as const, data: { url: LINK, expiresAt: "x" } })),
    openSession: vi.fn(async () => ({
      type: "success",
      url: `unreceipt://mailboxes?status=claim&code=${CODE}&provider=google`,
    })),
    claim: vi.fn(async () => ({ ok: true as const, data: { ok: true as const, connection: conn } })),
    claimed: new Set(),
    ...over,
  });

  it("connect-link → sign-in sheet → claim → connected", async () => {
    const deps = fakeDeps();
    expect(await runConnect("google", deps)).toEqual({ kind: "connected", connection: conn });
    expect(deps.connectLink).toHaveBeenCalledWith("google");
    expect(deps.openSession).toHaveBeenCalledWith(LINK);
    expect(deps.claim).toHaveBeenCalledWith(CODE);
  });

  it("stops at a refused connect link without opening the sheet", async () => {
    const deps = fakeDeps({ connectLink: vi.fn(async () => ({ ok: false as const, status: 409, code: "limit" })) });
    expect(await runConnect("google", deps)).toEqual({ kind: "failed", key: "limit" });
    expect(deps.openSession).not.toHaveBeenCalled();
  });

  it("never opens anything but a web page", async () => {
    const deps = fakeDeps({
      connectLink: vi.fn(async () => ({ ok: true as const, data: { url: "javascript:alert(1)" } })),
    });
    expect(await runConnect("google", deps)).toEqual({ kind: "failed", key: "serverError" });
    expect(deps.openSession).not.toHaveBeenCalled();
    expect(isWebUrl(LINK)).toBe(true);
    expect(isWebUrl("unreceipt://mailboxes")).toBe(false);
  });

  it("closing the sheet connects nothing and claims nothing", async () => {
    const deps = fakeDeps({ openSession: vi.fn(async () => ({ type: "cancel" })) });
    expect(await runConnect("google", deps)).toEqual({ kind: "cancelled" });
    expect(deps.claim).not.toHaveBeenCalled();
  });

  it("explains an error the provider sent back", async () => {
    const deps = fakeDeps({
      openSession: vi.fn(async () => ({ type: "success", url: "unreceipt://mailboxes?status=error&reason=scope_missing" })),
    });
    expect(await runConnect("google", deps)).toEqual({ kind: "failed", key: "scopeMissing" });
    expect(deps.claim).not.toHaveBeenCalled();
  });

  it("explains a refused claim", async () => {
    const deps = fakeDeps({ claim: vi.fn(async () => ({ ok: false as const, status: 403, code: "wrong_account" })) });
    expect(await runConnect("google", deps)).toEqual({ kind: "failed", key: "wrongAccount" });
  });

  it("claims a code only once (sheet answer and deep link)", async () => {
    const deps = fakeDeps();
    await runConnect("google", deps);
    expect(await finishOutcome({ kind: "claim", code: CODE, provider: "google" }, deps)).toEqual({ kind: "duplicate" });
    expect(deps.claim).toHaveBeenCalledTimes(1);
  });

  it("offline during the claim keeps the code for a retry", async () => {
    const claim = vi
      .fn<ConnectDeps["claim"]>()
      .mockRejectedValueOnce(new ApiError("offline"))
      .mockResolvedValueOnce({ ok: true, data: { ok: true, connection: conn } });
    const deps = fakeDeps({ claim });
    expect(await runConnect("google", deps)).toEqual({ kind: "failed", key: "offline", retryCode: CODE });
    expect(await finishOutcome({ kind: "claim", code: CODE, provider: null }, deps)).toEqual({
      kind: "connected",
      connection: conn,
    });
  });

  it("a session that ended signs out instead of showing an error", async () => {
    const deps = fakeDeps({
      connectLink: vi.fn(async () => {
        throw new ApiError("unauthorized");
      }),
    });
    expect(await runConnect("google", deps)).toEqual({ kind: "signedOut" });
  });

  it("offline before the sheet says so", async () => {
    const deps = fakeDeps({
      connectLink: vi.fn(async () => {
        throw new ApiError("offline");
      }),
    });
    expect(await runConnect("google", deps)).toEqual({ kind: "failed", key: "offline", retryCode: undefined });
  });
});

describe("deep-link inbox", () => {
  it("hands a waiting outcome over once and tells listeners", () => {
    const listener = vi.fn();
    const off = onInbox(listener);
    putInInbox({ kind: "cancelled" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(takeFromInbox()).toEqual({ kind: "cancelled" });
    expect(takeFromInbox()).toBeNull();
    off();
    putInInbox({ kind: "connected" });
    expect(listener).toHaveBeenCalledTimes(1);
    takeFromInbox();
  });
});
