// Calls to app.unreceipt.com with the signed-in user's access token
// (`Authorization: Bearer`, accepted by getServerUser() on the server).

import Constants from "expo-constants";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import type {
  MobileAccount,
  MobileAnalytics,
  MobileAnalyticsReceipts,
  MobileExport,
  MobileForwarding,
  MobileForwardingStatus,
  MobileHome,
} from "@/lib/mobile/types";
import { API_URL } from "../config";
import { supabase } from "./supabase";

export type ApiErrorKind = "unauthorized" | "offline" | "server";

export class ApiError extends Error {
  constructor(readonly kind: ApiErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "ApiError";
  }
}

const TIMEOUT_MS = 15_000;
// Sending a scan on a slow line plus up to ~30 s of reading on the server
// (maxDuration of /api/capture/scan). A retry after a timeout is safe: the
// scan's id makes the server answer with the receipt it already saved.
const UPLOAD_TIMEOUT_MS = 90_000;
const VERSION = Constants.expoConfig?.version ?? "0";
// Same marker as the old app shell (src/lib/native-app.ts): the server hides
// prices and purchase prompts for it. Display only, never access.
const USER_AGENT = `UnReceiptApp/${VERSION} (ios)`;

// Building an export renders a PDF per receipt (maxDuration 300 s on /api/export).
const EXPORT_TIMEOUT_MS = 300_000;

type CallOptions = {
  /** A 401 that the caller reads instead of "signed out" (account deletion's "sign in again"). */
  keep401?: (body: { error?: string }) => boolean;
  timeoutMs?: number;
};

async function send(path: string, token: string, init: RequestInit, timeoutMs?: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs ?? (init.body instanceof FormData ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS),
  );
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        // A FormData body sets its own multipart boundary.
        ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new ApiError("offline");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A call as the signed-in user, returning the raw response (for callers
 * that read the status themselves). Refreshes an expired token once.
 */
export async function apiResponse(path: string, init: RequestInit = {}, opts: CallOptions = {}): Promise<Response> {
  // An expired token is refreshed here. Offline, that refresh fails with a
  // network error and no session comes back: that is "offline", never
  // "signed out" (signing out would throw away scans waiting to be sent).
  const { data, error } = await supabase.auth.getSession();
  if (!data.session) throw new ApiError(isAuthRetryableFetchError(error) ? "offline" : "unauthorized");

  const read401 = async (r: Response) =>
    opts.keep401 ? opts.keep401((await r.clone().json().catch(() => ({}))) as { error?: string }) : false;

  let res = await send(path, data.session.access_token, init, opts.timeoutMs);
  // A 401 the caller reads (account deletion's "sign in again") comes back
  // at once: a refreshed token keeps the old sign-in time, so resending
  // would only spend the route's rate limit.
  if (res.status === 401 && (await read401(res))) return res;
  if (res.status === 401) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.data.session) {
      res = await send(path, refreshed.data.session.access_token, init, opts.timeoutMs);
    } else if (isAuthRetryableFetchError(refreshed.error)) {
      throw new ApiError("offline");
    }
  }
  if (res.status === 401) {
    if (await read401(res)) return res;
    throw new ApiError("unauthorized");
  }
  return res;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string | null };

/**
 * A call whose refusals the screen explains in the app's language: the
 * status and the server's error code (its English sentences are never
 * shown). Throws ApiError only for offline and signed out.
 */
export async function apiResult<T>(
  path: string,
  init: RequestInit = {},
  opts: CallOptions = {},
): Promise<ApiResult<T>> {
  const res = await apiResponse(path, init, opts);
  const body = (await res.json().catch(() => null)) as (T & { error?: unknown }) | null;
  if (res.ok) return { ok: true, data: (body ?? {}) as T };
  return { ok: false, status: res.status, code: typeof body?.error === "string" ? body.error : null };
}

export const postJson = <T = unknown>(path: string, body: unknown, method = "POST", opts: CallOptions = {}) =>
  apiResult<T>(path, { method, body: JSON.stringify(body) }, opts);

/** A JSON call as the signed-in user. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiResponse(path, init);
  if (!res.ok) throw new ApiError("server", `HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const getHome = () => api<MobileHome>("/api/mobile/home");

export const getAccount = () => api<MobileAccount>("/api/mobile/account");

/** The Insights screen for one period (query from src/lib/insights.ts periodQueryString). */
export const getAnalytics = (query: string) => api<MobileAnalytics>(`/api/mobile/analytics?${query}`);

/** The receipts behind a number on the Insights screen. */
export const getAnalyticsReceipts = (query: string) =>
  api<MobileAnalyticsReceipts>(`/api/mobile/analytics/receipts?${query}`);

/** One ZIP (or a few parts) of a month, a year or everything, as on the website. */
export const exportReceipts = (period: string) =>
  postJson<MobileExport>("/api/export", { period }, "POST", { timeoutMs: EXPORT_TIMEOUT_MS });

/** The company's currency (owners only; the server checks). */
export const setCurrency = (currency: string) => postJson("/api/organization/currency", { currency });

/** Invite the company's accountant by email. */
export const inviteAccountant = (email: string) => postJson("/api/accountant/invite", { email });

/** Stop sharing with a firm, or withdraw an invite still waiting. */
export const removeAccountantLink = (linkId: string) => postJson("/api/accountant/link", { linkId }, "DELETE");

/** The firm's Monday reminder email, for this company. */
export const setWeeklyReminders = (linkId: string, weeklyReminders: boolean) =>
  postJson("/api/accountant/link", { linkId, weeklyReminders }, "PATCH");

/**
 * Deletes the account for good (POST /api/account/delete). The server wants
 * a sign-in from the last 30 minutes in this session: "reauth_required" is a
 * 401 the screen answers with a new code, not a sign-out.
 */
export const deleteAccountNow = () =>
  postJson("/api/account/delete", { confirm: "DELETE" }, "POST", {
    keep401: (body) => body.error === "reauth_required",
    timeoutMs: 90_000,
  });

export const getForwarding = () => api<MobileForwarding>("/api/mobile/forwarding");

/** Gmail's confirmation code and the latest email to the address (the guide polls it). */
export const getForwardingStatus = () => api<MobileForwardingStatus>("/api/forwarding/status");

/** Emails the user a link to the setup guide, to follow it on a computer. */
export const sendForwardingLink = () => postJson<{ sentTo?: string }>("/api/forwarding/send-link", {});

/** The user's own other inboxes (receipts sent to them can be trusted). */
export const addOwnAddress = (address: string) => postJson("/api/profile/addresses", { address });
export const removeOwnAddress = (address: string) => postJson("/api/profile/addresses", { address }, "DELETE");

/** An accounting firm's invite: share the receipts, or not. */
export const respondToInvite = (inviteId: string, action: "accept" | "decline") =>
  postJson<{ status?: "active" | "revoked" }>("/api/accountant/respond", { inviteId, action });

/**
 * After a code sign-in: the server mirrors the profile and queues the
 * welcome email (the same call the website makes). Best effort.
 */
export function finishSignIn(): void {
  api("/api/auth/finish", { method: "POST" }).catch(() => {});
}
