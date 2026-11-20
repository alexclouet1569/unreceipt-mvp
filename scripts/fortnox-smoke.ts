// Checks the booking agent's Fortnox calls against a real Fortnox company,
// ideally a TEST company from Fortnox's Developer Portal. It uses the same
// code as the app (src/lib/accounting/fortnox/), so a green run means the
// API shapes the agent assumes are right.
//
//   FORTNOX_CLIENT_ID=… FORTNOX_CLIENT_SECRET=… \
//     npx tsx --conditions=react-server scripts/fortnox-smoke.ts <tenantId> [--post=<orgNumber>]
//
// <tenantId>: the company's Fortnox TenantId (accounting_connections.tenant_id
// after connecting it in UnReceipt; for a test company, its DatabaseNumber).
//
// Without --post it only reads: the company, accounts, financial years,
// voucher series and locked period, and checks a token comes back.
// With --post=<orgNumber> (the test company's org number, checked against
// what Fortnox says before anything is posted) it also books ONE balanced
// test voucher of 1.00 kr
// (6990 debit / 1930 credit, today, the first voucher series), attaches a
// one-page PDF, and finds the voucher again by its marker. Vouchers can't
// be deleted in Fortnox, only reversed: run --post on a test company only.
//
// Prints counts, names and the voucher number. Never prints a token.

import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { fortnoxCaller } from "../src/lib/accounting/fortnox/api";
import { loadBookingContext, readCompany } from "../src/lib/accounting/fortnox/context";
import { clientCredentialsToken } from "../src/lib/accounting/fortnox/oauth";
import { findVoucherByMarker, postVoucher } from "../src/lib/accounting/fortnox/post";
import { bookingMarker, isBalanced, voucherDescription } from "../src/lib/accounting/propose";
import type { ProposedVoucher } from "../src/lib/accounting/types";

async function main() {
  const [tenantId, flag] = process.argv.slice(2);
  if (!tenantId || !/^[0-9]{1,20}$/.test(tenantId)) {
    console.error("usage: fortnox-smoke.ts <tenantId> [--post=<orgNumber>]");
    process.exit(2);
  }
  const expectedOrg = flag?.startsWith("--post=") ? flag.slice("--post=".length).replace(/\D/g, "") : null;
  if (flag && !expectedOrg) {
    console.error("--post needs the test company's org number: --post=556677-8899");
    process.exit(2);
  }

  const grant = await clientCredentialsToken(tenantId);
  console.log("token: ok (expires in", Math.round((grant.expiresAt - Date.now()) / 60000), "min)");
  const call = fortnoxCaller(grant.accessToken, `smoke:${tenantId}`);

  const company = await readCompany(call);
  console.log("company:", company.name ?? "(no name)", company.orgNumber ?? "(no org number)");

  const ctx = await loadBookingContext(`smoke:${tenantId}`, call);
  const active = [...ctx.accounts.values()].filter((a) => a.active).length;
  console.log("accounts:", ctx.accounts.size, "(", active, "active )");
  console.log("financial years:", ctx.financialYears.map((y) => `${y.id}: ${y.from}..${y.to}`).join(", ") || "none");
  console.log("voucher series:", ctx.voucherSeries.join(", ") || "none");
  console.log("locked through:", ctx.lockedThrough ?? "nothing locked");
  for (const n of ["1930", "2640", "2890", "6990"]) {
    console.log(`  account ${n}:`, ctx.accounts.get(n)?.active ? "active" : "missing or inactive");
  }

  if (!expectedOrg) {
    console.log("\nRead-only run done. Add --post=<orgNumber> to book one 1.00 kr test voucher (test companies only).");
    return;
  }
  // Never into another company than the one named on the command line.
  if ((company.orgNumber ?? "").replace(/\D/g, "") !== expectedOrg) {
    console.error("refused: this Fortnox company's org number isn't", expectedOrg, "- nothing posted");
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const year = ctx.financialYears.find((y) => y.from <= today && today <= y.to);
  const series = ctx.voucherSeries[0];
  if (!year || !series) throw new Error("no financial year for today or no voucher series");
  if (ctx.lockedThrough && today <= ctx.lockedThrough) throw new Error("today is in a locked period");

  const fakeReceiptId = randomUUID();
  const voucher: ProposedVoucher = {
    transactionDate: today,
    description: voucherDescription("UnReceipt smoke test", fakeReceiptId),
    series,
    financialYearId: year.id,
    rows: [
      { account: "6990", debit: 1, credit: 0 },
      { account: "1930", debit: 0, credit: 1 },
    ],
    totalSek: 1,
  };
  if (!isBalanced(voucher.rows)) throw new Error("test voucher doesn't balance");

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 200]);
  page.drawText("UnReceipt smoke test receipt", { x: 20, y: 150, size: 12, font: await pdf.embedFont(StandardFonts.Helvetica) });
  const file = { bytes: await pdf.save(), name: "unreceipt-smoke.pdf", contentType: "application/pdf" };

  const outcome = await postVoucher(call, voucher, file, {
    fileUploaded: async (id) => console.log("file uploaded to inbox_v: ok", id ? "(id received)" : ""),
  });
  console.log("post:", JSON.stringify(outcome));
  if (outcome.status !== "posted") process.exit(1);

  const found = await findVoucherByMarker(call, voucher, bookingMarker(fakeReceiptId));
  console.log("found again by marker:", found ? `${found.series} ${found.number}` : "NOT FOUND");
  if (!found) process.exit(1);
  console.log("\nAll good. Reverse the test voucher in Fortnox if you want the test company clean.");
}

main().catch((err: unknown) => {
  console.error("failed:", err instanceof Error ? `${err.name}: ${err.message}` : "unknown error");
  process.exit(1);
});
