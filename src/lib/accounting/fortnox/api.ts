// SERVER-ONLY. The one place that calls api.fortnox.se.
//
// * 20 s per request (Fortnox answers in well under a second normally).
// * At most 25 requests per 5 s per access token on this instance (Fortnox's
//   limit), and a 429 is retried after a short wait: Fortnox refused it, so
//   nothing was created and a retry is safe.
// * Failures are typed so the caller can tell a definite refusal (Fortnox
//   answered with an error: nothing was created) from an uncertain one (no
//   answer, a timeout, a 5xx: a voucher may or may not exist). Posting treats
//   the second as "reconcile before retrying", never as "retry".
//
// Nothing here logs a token, a body or an amount.

import "server-only";

export const FORTNOX_API_BASE = "https://api.fortnox.se/3";
const REQUEST_TIMEOUT_MS = 20_000;
const WINDOW_MS = 5_000;
const WINDOW_LIMIT = 25;
const MAX_429_RETRIES = 2;

/** Fortnox answered and refused (4xx other than 429): nothing was created. */
export class FortnoxApiError extends Error {
  constructor(
    readonly status: number,
    /** Fortnox's own numeric error code, when it sent one. */
    readonly fortnoxCode: number | null,
    message: string,
  ) {
    super(message);
    this.name = "FortnoxApiError";
  }
}

/** The access token was refused (401): refresh, or reconnect. */
export class FortnoxAuthError extends Error {
  constructor() {
    super("fortnox refused the access token");
    this.name = "FortnoxAuthError";
  }
}

/** No usable answer (network, timeout, 5xx, 429 after retries): outcome unknown. */
export class FortnoxUncertainError extends Error {
  constructor(readonly reason: "network" | "timeout" | "server" | "rate_limited") {
    super(`fortnox request outcome unknown (${reason})`);
    this.name = "FortnoxUncertainError";
  }
}

// Sliding window per token (keyed by a short hash-free prefix id the caller
// passes, never the token itself).
const windows = new Map<string, number[]>();

async function throttle(key: string, now: () => number = Date.now): Promise<void> {
  for (;;) {
    const t = now();
    const hits = (windows.get(key) ?? []).filter((at) => t - at < WINDOW_MS);
    if (hits.length < WINDOW_LIMIT) {
      hits.push(t);
      windows.set(key, hits);
      return;
    }
    const wait = WINDOW_MS - (t - hits[0]) + 10;
    await new Promise((r) => setTimeout(r, wait));
  }
}

export function _resetFortnoxThrottleForTests(): void {
  windows.clear();
}

type ErrorBody = {
  ErrorInformation?: { Error?: number; error?: number; Message?: string; message?: string; Code?: number; code?: number };
};

function readError(body: unknown): { code: number | null; message: string } {
  const info = (body as ErrorBody | null)?.ErrorInformation;
  const code = info?.Code ?? info?.code ?? null;
  const message = info?.Message ?? info?.message ?? "Fortnox refused the request";
  return { code: typeof code === "number" ? code : null, message: String(message).slice(0, 200) };
}

export type FortnoxRequest = {
  method: "GET" | "POST" | "PUT";
  path: string;
  query?: Record<string, string | number | undefined>;
  json?: unknown;
  /** A single file upload (multipart/form-data, field "file"). */
  file?: { bytes: Uint8Array; name: string; contentType: string };
};

export type FortnoxCaller = <T>(req: FortnoxRequest) => Promise<T>;

/**
 * A caller bound to one access token. `throttleKey` identifies the
 * connection (its row id), never the token.
 */
export function fortnoxCaller(
  accessToken: string,
  throttleKey: string,
  fetchImpl: typeof fetch = fetch,
): FortnoxCaller {
  return async function call<T>(req: FortnoxRequest): Promise<T> {
    const url = new URL(`${FORTNOX_API_BASE}${req.path}`);
    for (const [k, v] of Object.entries(req.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    for (let attempt = 0; ; attempt++) {
      await throttle(throttleKey);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      };
      let body: BodyInit | undefined;
      if (req.file) {
        const form = new FormData();
        form.append("file", new Blob([req.file.bytes as BlobPart], { type: req.file.contentType }), req.file.name);
        body = form;
      } else if (req.json !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(req.json);
      }

      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: req.method,
          headers,
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: "no-store",
        });
      } catch (err) {
        const name = (err as { name?: string } | null)?.name;
        throw new FortnoxUncertainError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
      }

      if (res.status === 429) {
        if (attempt < MAX_429_RETRIES) {
          await new Promise((r) => setTimeout(r, 1_000 * (attempt + 1)));
          continue;
        }
        throw new FortnoxUncertainError("rate_limited");
      }
      if (res.status === 401) throw new FortnoxAuthError();
      if (res.status >= 500) throw new FortnoxUncertainError("server");

      const parsed = await res.json().catch(() => null);
      if (!res.ok) {
        const { code, message } = readError(parsed);
        throw new FortnoxApiError(res.status, code, message);
      }
      return parsed as T;
    }
  };
}
