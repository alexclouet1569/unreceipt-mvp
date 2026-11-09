// Calls to app.unreceipt.com with the signed-in user's access token
// (`Authorization: Bearer`, accepted by getServerUser() on the server).

import Constants from "expo-constants";
import type { MobileHome } from "@/lib/mobile/types";
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
const VERSION = Constants.expoConfig?.version ?? "0";
// Same marker as the old app shell (src/lib/native-app.ts): the server hides
// prices and purchase prompts for it. Display only, never access.
const USER_AGENT = `UnReceiptApp/${VERSION} (ios)`;

async function send(path: string, token: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
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

/** A JSON call as the signed-in user. Refreshes an expired token once. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new ApiError("unauthorized");

  let res = await send(path, data.session.access_token, init);
  if (res.status === 401) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.data.session) {
      res = await send(path, refreshed.data.session.access_token, init);
    }
  }
  if (res.status === 401) throw new ApiError("unauthorized");
  if (!res.ok) throw new ApiError("server", `HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const getHome = () => api<MobileHome>("/api/mobile/home");

/**
 * After a code sign-in: the server mirrors the profile and queues the
 * welcome email (the same call the website makes). Best effort.
 */
export function finishSignIn(): void {
  api("/api/auth/finish", { method: "POST" }).catch(() => {});
}
