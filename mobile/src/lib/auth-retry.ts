// What a 401 from app.unreceipt.com means for the app. Pure (no React
// Native), so it's tested.
//
// "unauthorized" signs the user out and clears the phone's saved list, so
// it is thrown only when the session itself is gone: the refresh token was
// refused. A 401 that comes back again after a refresh that worked is the
// server's trouble (a slow token check, a deploy): "server", tried again
// later, never a sign-out.

import { ApiError } from "./api-error";

/** What refreshing the session gave. */
export type Refreshed =
  | { kind: "token"; accessToken: string }
  /** No network: the session may well be fine. */
  | { kind: "offline" }
  /** The refresh was refused: the session is over. */
  | { kind: "signedOut" };

export type RetrySteps = {
  /** A 401 the caller reads itself (account deletion's "sign in again"). */
  keep401: (res: Response) => Promise<boolean>;
  refresh: () => Promise<Refreshed>;
  resend: (accessToken: string) => Promise<Response>;
};

/** The answer to show for a first response, refreshing the token once on a 401. */
export async function afterUnauthorized(first: Response, steps: RetrySteps): Promise<Response> {
  if (first.status !== 401) return first;
  // Comes back at once: a refreshed token keeps the old sign-in time, so
  // resending would only spend the route's rate limit.
  if (await steps.keep401(first)) return first;
  const refreshed = await steps.refresh();
  if (refreshed.kind === "offline") throw new ApiError("offline");
  if (refreshed.kind === "signedOut") throw new ApiError("unauthorized");
  const res = await steps.resend(refreshed.accessToken);
  if (res.status !== 401 || (await steps.keep401(res))) return res;
  throw new ApiError("server", "HTTP 401 after a successful token refresh");
}
