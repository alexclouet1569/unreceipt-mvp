// One-off backfill: re-run the new parser against every pending_review
// row that landed before the parser body was real. Skips manual rows
// (no source artifact) and rows with no original_source_url / image_url.
//
// Usage:
//   ANTHROPIC_API_KEY=... \
//   NEXT_PUBLIC_SUPABASE_URL=... \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   npx tsx scripts/reparse-pending-rows.ts [--dry-run] [--limit=50]
//
// Costs LLM tokens (one call per pending row that hits the LLM
// fallback). Default --limit=50 keeps a single run under ~$0.50 at
// current Claude Sonnet pricing. Bump with --limit=N or remove the
// flag to drain the queue.
//
// Idempotent: a row that flips to 'verified' is filtered out of the
// next run, and a row that stays pending_review is re-queued for the
// next run with whatever the LLM returned this time.

import { createClient } from "@supabase/supabase-js";
import { parseReceipt } from "../src/lib/receipts/parser";
import { computeReceiptStatus } from "../src/lib/receipts/status";
import type { Receipt } from "../src/lib/types";

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = (() => {
  const arg = process.argv.find((a) => a.startsWith("--limit="));
  if (!arg) return 50;
  const n = Number(arg.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : 50;
})();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[reparse] missing env: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.error(
    `[reparse] DRY_RUN=${DRY_RUN} LIMIT=${LIMIT} — fetching pending rows…`
  );

  const { data: rows, error } = await admin
    .from("receipts")
    .select("*")
    .eq("status", "pending_review")
    .in("source", ["email", "sms", "paper"])
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) {
    console.error("[reparse] fetch failed:", error);
    process.exit(1);
  }

  console.error(`[reparse] ${rows.length} candidate rows`);

  let flipped = 0;
  let stillPending = 0;
  let skipped = 0;

  for (const row of rows as Receipt[]) {
    const id = row.id;
    try {
      // Supabase typings around the Database generic argue with the
      // strict project tsconfig — we know the client shape works at
      // runtime, so cast through unknown at the script boundary.
      const result = await parseFromRow(
        row,
        admin as unknown as AdminClient
      );
      if (!result) {
        skipped++;
        console.error(`[reparse] ${id} skipped (no usable source)`);
        continue;
      }

      if (result.status !== "ok") {
        stillPending++;
        console.error(`[reparse] ${id} → still pending_review`);
        continue;
      }

      const fields = result.fields;
      const newStatus = computeReceiptStatus({
        merchant_name: fields.merchant_name,
        purchased_at: fields.purchased_at,
        total: fields.total,
        parse_confidence: fields.parse_confidence,
      });

      if (newStatus !== "verified") {
        stillPending++;
        console.error(`[reparse] ${id} → status remained ${newStatus}`);
        continue;
      }

      if (DRY_RUN) {
        flipped++;
        console.error(
          `[reparse] ${id} WOULD flip → merchant=${fields.merchant_name} total=${fields.total} ${fields.currency}`
        );
        continue;
      }

      const update = {
        merchant_name: fields.merchant_name,
        purchased_at: fields.purchased_at,
        receipt_date: fields.purchased_at.slice(0, 10),
        total: fields.total,
        currency: fields.currency,
        subtotal: fields.subtotal ?? row.subtotal,
        tax_amount: fields.tax_amount ?? row.tax_amount,
        tax_rate: fields.tax_rate ?? row.tax_rate,
        payment_method: fields.payment_method ?? row.payment_method,
        card_last_four: fields.card_last_four ?? row.card_last_four,
        category: fields.category ?? row.category,
        parse_confidence: fields.parse_confidence,
        status: newStatus,
        notes: fields.notes ?? row.notes,
      };

      const { error: updError } = await admin
        .from("receipts")
        .update(update)
        .eq("id", id);

      if (updError) {
        console.error(`[reparse] ${id} update failed:`, updError);
        continue;
      }
      flipped++;
      console.error(
        `[reparse] ${id} flipped → ${fields.merchant_name} ${fields.total} ${fields.currency}`
      );
    } catch (err) {
      console.error(`[reparse] ${id} threw:`, err);
    }
  }

  console.error(
    `[reparse] done. flipped=${flipped} still_pending=${stillPending} skipped=${skipped}`
  );
}

// One-off script — loose-type the admin client so we don't have to
// re-declare the Database generic at this surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = ReturnType<typeof createClient<any, "public", "public">>;

async function parseFromRow(
  row: Receipt,
  admin: AdminClient
): Promise<Awaited<ReturnType<typeof parseReceipt>> | null> {
  switch (row.source) {
    case "manual":
      return null;
    case "email": {
      const eml = await downloadAsText(admin, "receipt-originals", row.original_source_url);
      if (!eml) return null;
      const { headers, body } = splitEml(eml);
      return await parseReceipt({
        kind: "email",
        raw: {
          from: headers["from"] ?? "",
          to: headers["to"] ?? "",
          subject: headers["subject"] ?? "",
          text: body,
          html: null,
        },
      });
    }
    case "sms": {
      const txt = await downloadAsText(
        admin,
        "receipt-originals",
        row.original_source_url
      );
      if (!txt) return null;
      return await parseReceipt({
        kind: "sms",
        raw: { from: "", body: txt },
      });
    }
    case "paper": {
      // We don't re-OCR here — rely on previously stored notes/ocr text
      // if present. Most paper rows already went through OCR at capture
      // time; rerunning OCR is a separate followup.
      const ocrText = row.notes ?? "";
      if (ocrText.length < 10) return null;
      return await parseReceipt({
        kind: "paper",
        raw: { ocrText },
      });
    }
  }
}

async function downloadAsText(
  admin: AdminClient,
  bucket: string,
  path: string | null
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) return null;
  return await data.text();
}

function splitEml(raw: string): { headers: Record<string, string>; body: string } {
  const split = raw.indexOf("\r\n\r\n");
  const splitIdx = split >= 0 ? split : raw.indexOf("\n\n");
  const headerBlock = splitIdx >= 0 ? raw.slice(0, splitIdx) : raw;
  const body = splitIdx >= 0 ? raw.slice(splitIdx).replace(/^\s+/, "") : "";
  const headers: Record<string, string> = {};
  for (const line of headerBlock.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z-]+):\s*(.+)$/);
    if (m) headers[m[1].toLowerCase()] = m[2].trim();
  }
  return { headers, body };
}

main().catch((err) => {
  console.error("[reparse] fatal:", err);
  process.exit(1);
});
