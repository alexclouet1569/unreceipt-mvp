// SERVER-ONLY. Posts one approved voucher to Fortnox, with the receipt file
// attached. The steps, each saved before the next:
//
//   1. upload the file to the voucher inbox (inbox_v)       → fortnox_file_id
//   2. create the voucher, its description carrying the marker
//   3. attach the file to the voucher (voucherfileconnections)
//
// A Fortnox voucher can't be deleted, only reversed, so step 2 is never
// blindly retried: when Fortnox's answer is lost (timeout, 5xx) the outcome
// is "unknown" and reconcile() searches the day's vouchers for the marker
// before anything else happens. A definite refusal (Fortnox answered with an
// error) means nothing was created: "failed", and a person may approve again.

import "server-only";

import type { ProposedVoucher } from "../types";
import { FortnoxApiError, FortnoxAuthError, FortnoxUncertainError, type FortnoxCaller } from "./api";

export type ReceiptFile = { bytes: Uint8Array; name: string; contentType: string };

export type PostOutcome =
  | { status: "posted"; series: string; number: number; year: number; fileConnected: boolean }
  | { status: "failed"; errorCode: string }
  | { status: "unknown"; errorCode: string };

/** Persistence hooks, so each step is saved before the next (and tests can watch). */
export type PostHooks = {
  fileUploaded(fileId: string): Promise<void>;
};

function refusedCode(prefix: string, err: FortnoxApiError): string {
  return err.fortnoxCode ? `${prefix}_${err.fortnoxCode}`.slice(0, 64) : `${prefix}_${err.status}`;
}

export function voucherPayload(voucher: ProposedVoucher) {
  return {
    Voucher: {
      Description: voucher.description,
      TransactionDate: voucher.transactionDate,
      VoucherSeries: voucher.series,
      VoucherRows: voucher.rows.map((r) => ({ Account: Number(r.account), Debit: r.debit, Credit: r.credit })),
    },
  };
}

export async function uploadFile(call: FortnoxCaller, file: ReceiptFile): Promise<string> {
  const res = await call<{ File?: { Id?: string } }>({
    method: "POST",
    path: "/inbox",
    query: { path: "inbox_v" },
    file,
  });
  const id = res.File?.Id;
  if (!id) throw new FortnoxUncertainError("server");
  return String(id);
}

export async function connectFile(
  call: FortnoxCaller,
  input: { fileId: string; series: string; number: number; year: number },
): Promise<boolean> {
  try {
    await call({
      method: "POST",
      path: "/voucherfileconnections",
      query: { financialyear: input.year },
      json: {
        VoucherFileConnection: {
          FileId: input.fileId,
          VoucherNumber: String(input.number),
          VoucherSeries: input.series,
        },
      },
    });
    return true;
  } catch {
    // The voucher stands; the daily job attaches the file later.
    return false;
  }
}

export async function postVoucher(
  call: FortnoxCaller,
  voucher: ProposedVoucher,
  file: ReceiptFile,
  hooks: PostHooks,
  existingFileId: string | null = null,
): Promise<PostOutcome> {
  // 1. The file. An orphan file in Fortnox's inbox is harmless, so any
  //    failure here is a plain "failed": no voucher exists yet.
  let fileId = existingFileId;
  if (!fileId) {
    try {
      fileId = await uploadFile(call, file);
    } catch (err) {
      return { status: "failed", errorCode: err instanceof FortnoxApiError ? refusedCode("file_refused", err) : "file_upload_failed" };
    }
    await hooks.fileUploaded(fileId);
  }

  // 2. The voucher.
  let created: { VoucherNumber?: number | string; VoucherSeries?: string; Year?: number | string } | undefined;
  try {
    const res = await call<{ Voucher?: typeof created }>({
      method: "POST",
      path: "/vouchers",
      query: { financialyear: voucher.financialYearId },
      json: voucherPayload(voucher),
    });
    created = res.Voucher;
  } catch (err) {
    if (err instanceof FortnoxApiError) return { status: "failed", errorCode: refusedCode("voucher_refused", err) };
    // A 401 is a refusal too: Fortnox created nothing.
    if (err instanceof FortnoxAuthError) return { status: "failed", errorCode: "voucher_auth" };
    if (err instanceof FortnoxUncertainError) return { status: "unknown", errorCode: `voucher_${err.reason}` };
    // Anything else (a bug, an auth error after retry): we can't know.
    return { status: "unknown", errorCode: "voucher_error" };
  }
  const number = Number(created?.VoucherNumber);
  const series = String(created?.VoucherSeries ?? voucher.series);
  const year = Number(created?.Year ?? voucher.financialYearId);
  if (!Number.isInteger(number)) return { status: "unknown", errorCode: "voucher_no_number" };

  // 3. The attachment.
  const fileConnected = await connectFile(call, { fileId, series, number, year });
  return { status: "posted", series, number, year, fileConnected };
}

type VoucherListItem = {
  Description?: string;
  VoucherNumber?: number | string;
  VoucherSeries?: string;
  Year?: number | string;
};

/**
 * Finds the voucher carrying `marker` on the voucher's day, or null when
 * Fortnox has none. Throws when Fortnox can't be asked (try again later).
 */
export async function findVoucherByMarker(
  call: FortnoxCaller,
  voucher: ProposedVoucher,
  marker: string,
): Promise<{ series: string; number: number; year: number } | null> {
  for (let page = 1; page <= 5; page++) {
    const res = await call<{ Vouchers?: VoucherListItem[]; MetaInformation?: { "@TotalPages"?: number } }>({
      method: "GET",
      path: `/vouchers/sublist/${encodeURIComponent(voucher.series)}`,
      query: {
        financialyear: voucher.financialYearId,
        fromdate: voucher.transactionDate,
        todate: voucher.transactionDate,
        page,
        limit: 500,
      },
    });
    const hit = (res.Vouchers ?? []).find((v) => typeof v.Description === "string" && v.Description.includes(marker));
    if (hit) {
      const number = Number(hit.VoucherNumber);
      if (Number.isInteger(number)) {
        return { series: String(hit.VoucherSeries ?? voucher.series), number, year: Number(hit.Year ?? voucher.financialYearId) };
      }
    }
    const total = Number(res.MetaInformation?.["@TotalPages"] ?? 1);
    if (!Number.isFinite(total) || page >= total) break;
  }
  return null;
}
