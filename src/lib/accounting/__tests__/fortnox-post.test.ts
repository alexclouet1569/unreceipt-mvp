import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetFortnoxThrottleForTests,
  fortnoxCaller,
  FortnoxApiError,
  FortnoxAuthError,
  FortnoxUncertainError,
  type FortnoxCaller,
  type FortnoxRequest,
} from "@/lib/accounting/fortnox/api";
import { findVoucherByMarker, postVoucher, voucherPayload } from "@/lib/accounting/fortnox/post";
import type { ProposedVoucher } from "@/lib/accounting/types";

const VOUCHER: ProposedVoucher = {
  transactionDate: "2026-11-12",
  description: "Clas Ohlson · UnReceipt a1b2c3d4e5f6",
  series: "UL",
  financialYearId: 7,
  rows: [
    { account: "6110", debit: 100, credit: 0 },
    { account: "2640", debit: 25, credit: 0 },
    { account: "1930", debit: 0, credit: 125 },
  ],
  totalSek: 125,
};
const FILE = { bytes: new Uint8Array([1, 2, 3]), name: "kvitto.jpg", contentType: "image/jpeg" };

/** A fake Fortnox: answers by path, records every call. */
function fake(handlers: Partial<Record<string, (req: FortnoxRequest) => unknown>>) {
  const calls: FortnoxRequest[] = [];
  const call: FortnoxCaller = async <T,>(req: FortnoxRequest) => {
    calls.push(req);
    const key = Object.keys(handlers).find((k) => req.path.startsWith(k));
    if (!key) throw new Error(`unexpected ${req.path}`);
    return handlers[key]!(req) as T;
  };
  return { call, calls };
}

describe("postVoucher", () => {
  it("uploads, creates the voucher, then attaches the file", async () => {
    const { call, calls } = fake({
      "/inbox": () => ({ File: { Id: "file-9" } }),
      "/vouchers": () => ({ Voucher: { VoucherNumber: 42, VoucherSeries: "UL", Year: 7 } }),
      "/voucherfileconnections": () => ({}),
    });
    const fileUploaded = vi.fn(async () => undefined);
    await expect(postVoucher(call, VOUCHER, FILE, { fileUploaded })).resolves.toEqual({
      status: "posted",
      series: "UL",
      number: 42,
      year: 7,
      fileConnected: true,
    });
    expect(fileUploaded).toHaveBeenCalledWith("file-9");
    expect(calls.map((c) => c.path)).toEqual(["/inbox", "/vouchers", "/voucherfileconnections"]);
    expect(calls[0].query).toEqual({ path: "inbox_v" });
    expect(calls[1].query).toEqual({ financialyear: 7 });
    expect(calls[1].json).toEqual(voucherPayload(VOUCHER));
    expect(calls[2].json).toEqual({ VoucherFileConnection: { FileId: "file-9", VoucherNumber: "42", VoucherSeries: "UL" } });
  });

  it("sends accounts as numbers and amounts as given", () => {
    expect(voucherPayload(VOUCHER).Voucher.VoucherRows[0]).toEqual({ Account: 6110, Debit: 100, Credit: 0 });
  });

  it("reuses a file already uploaded by an earlier attempt", async () => {
    const { call, calls } = fake({
      "/vouchers": () => ({ Voucher: { VoucherNumber: 43, VoucherSeries: "UL", Year: 7 } }),
      "/voucherfileconnections": () => ({}),
    });
    await postVoucher(call, VOUCHER, FILE, { fileUploaded: async () => undefined }, "file-1");
    expect(calls.map((c) => c.path)).toEqual(["/vouchers", "/voucherfileconnections"]);
  });

  it("is 'failed' (nothing created) when the upload or the voucher is refused", async () => {
    const upload = fake({
      "/inbox": () => {
        throw new FortnoxApiError(400, 2000106, "bad file");
      },
    });
    await expect(postVoucher(upload.call, VOUCHER, FILE, { fileUploaded: async () => undefined })).resolves.toEqual({
      status: "failed",
      errorCode: "file_refused_2000106",
    });
    expect(upload.calls).toHaveLength(1);

    const refused = fake({
      "/inbox": () => ({ File: { Id: "f" } }),
      "/vouchers": () => {
        throw new FortnoxApiError(400, 2000588, "period locked");
      },
    });
    await expect(postVoucher(refused.call, VOUCHER, FILE, { fileUploaded: async () => undefined })).resolves.toEqual({
      status: "failed",
      errorCode: "voucher_refused_2000588",
    });

    const auth = fake({
      "/inbox": () => ({ File: { Id: "f" } }),
      "/vouchers": () => {
        throw new FortnoxAuthError();
      },
    });
    await expect(postVoucher(auth.call, VOUCHER, FILE, { fileUploaded: async () => undefined })).resolves.toMatchObject({
      status: "failed",
    });
  });

  it("is 'unknown' when Fortnox's answer to the voucher is lost", async () => {
    const { call } = fake({
      "/inbox": () => ({ File: { Id: "f" } }),
      "/vouchers": () => {
        throw new FortnoxUncertainError("timeout");
      },
    });
    await expect(postVoucher(call, VOUCHER, FILE, { fileUploaded: async () => undefined })).resolves.toEqual({
      status: "unknown",
      errorCode: "voucher_timeout",
    });
  });

  it("stays posted when only the attachment fails", async () => {
    const { call } = fake({
      "/inbox": () => ({ File: { Id: "f" } }),
      "/vouchers": () => ({ Voucher: { VoucherNumber: 5, VoucherSeries: "UL", Year: 7 } }),
      "/voucherfileconnections": () => {
        throw new FortnoxUncertainError("server");
      },
    });
    await expect(postVoucher(call, VOUCHER, FILE, { fileUploaded: async () => undefined })).resolves.toMatchObject({
      status: "posted",
      number: 5,
      fileConnected: false,
    });
  });
});

describe("findVoucherByMarker", () => {
  it("finds the voucher on the day by its marker", async () => {
    const { call, calls } = fake({
      "/vouchers/sublist/UL": () => ({
        Vouchers: [
          { Description: "Other", VoucherNumber: 40, VoucherSeries: "UL", Year: 7 },
          { Description: "Clas Ohlson · UnReceipt a1b2c3d4e5f6", VoucherNumber: 41, VoucherSeries: "UL", Year: 7 },
        ],
        MetaInformation: { "@TotalPages": 1 },
      }),
    });
    await expect(findVoucherByMarker(call, VOUCHER, "UnReceipt a1b2c3d4e5f6")).resolves.toEqual({
      series: "UL",
      number: 41,
      year: 7,
    });
    expect(calls[0].query).toMatchObject({ fromdate: "2026-11-12", todate: "2026-11-12", financialyear: 7 });
    await expect(findVoucherByMarker(call, VOUCHER, "UnReceipt ffffffffffff")).resolves.toBeNull();
  });
});

describe("fortnoxCaller", () => {
  beforeEach(() => _resetFortnoxThrottleForTests());

  function respond(status: number, body: unknown) {
    return vi.fn(async () => new Response(JSON.stringify(body), { status }));
  }

  it("maps Fortnox's answers to typed errors", async () => {
    await expect(
      fortnoxCaller("t", "c", respond(400, { ErrorInformation: { error: 1, message: "Fel", code: 2000588 } }) as never)({
        method: "GET",
        path: "/accounts",
      }),
    ).rejects.toMatchObject({ name: "FortnoxApiError", status: 400, fortnoxCode: 2000588 });
    await expect(fortnoxCaller("t", "c", respond(401, {}) as never)({ method: "GET", path: "/x" })).rejects.toBeInstanceOf(
      FortnoxAuthError,
    );
    await expect(fortnoxCaller("t", "c", respond(503, {}) as never)({ method: "GET", path: "/x" })).rejects.toMatchObject({
      reason: "server",
    });
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(fortnoxCaller("t", "c", down as never)({ method: "GET", path: "/x" })).rejects.toMatchObject({
      reason: "network",
    });
  });

  it("retries a 429 (nothing was created) and sends the bearer token", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    const p = fortnoxCaller("tok", "c", fetchImpl as never)({ method: "GET", path: "/accounts", query: { page: 1 } });
    await vi.advanceTimersByTimeAsync(1_100);
    await expect(p).resolves.toEqual({ ok: 1 });
    vi.useRealTimers();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api.fortnox.se/3/accounts?page=1");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" });
  });
});
