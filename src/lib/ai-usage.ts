// SERVER-ONLY. What each Claude call cost, in tokens, so the real AI cost
// per receipt is known instead of estimated (founder decision 2026-11-15).
//
// One row per call in public.ai_usage: where it came from (`area`), the
// model and the token counts the API reported. Counts only: never the
// image, the email, the answer or who it was for. Written best effort and
// never awaited by the caller's answer path: a failed write must not fail a
// receipt. /admin/pilot shows this month's calls and estimated cost.
//
// Never import this file from a "use client" component: it uses the
// service-role Supabase client.

import type Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { getSupabaseAdmin } from "./supabase-admin";

export type AiArea = "ocr" | "ocr_stream" | "capture_scan" | "reprocess" | "email_attachment" | "email_text" | "other";

/**
 * USD per million tokens (Anthropic list prices, checked 2026-11-15). Cache
 * writes cost 1.25× input; cache reads the model's own read price. A model
 * not listed is costed at Sonnet 5.5's prices and marked as unknown.
 */
export const MODEL_PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
};

export type UsageRow = {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
};

/** The call's cost in USD from its token counts. */
export function usageCostUsd(row: UsageRow): number {
  // Served model ids can carry a suffix; match on the family prefix.
  const key = Object.keys(MODEL_PRICES).find((k) => row.model === k || row.model.startsWith(`${k}-`));
  const p = MODEL_PRICES[key ?? "claude-sonnet-5-5"];
  return (
    (row.input_tokens * p.input +
      row.cache_write_tokens * p.input * 1.25 +
      row.cache_read_tokens * p.cacheRead +
      row.output_tokens * p.output) /
    1_000_000
  );
}

export function usageRowFrom(model: string, usage: Anthropic.Usage | null | undefined): UsageRow {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
  return {
    model: model.slice(0, 80),
    input_tokens: n(usage?.input_tokens),
    output_tokens: n(usage?.output_tokens),
    cache_read_tokens: n(usage?.cache_read_input_tokens),
    cache_write_tokens: n(usage?.cache_creation_input_tokens),
  };
}

/**
 * Records one call. Never throws and never delays the answer: inside a
 * request the write runs in after() (a function can be frozen once its
 * response is sent, which would lose a plain fire-and-forget insert).
 */
export function recordAiUsage(area: AiArea, model: string, usage: Anthropic.Usage | null | undefined): void {
  if (!usage) return;
  const write = async () => {
    try {
      const res = await getSupabaseAdmin().from("ai_usage").insert({ area, ...usageRowFrom(model, usage) });
      if (res.error) console.error("[ai-usage] insert failed", res.error.code);
    } catch {
      // No database client (tests, a missing env var): nothing to record.
    }
  };
  try {
    after(write);
  } catch {
    // Outside a request (scripts, tests): write now, unawaited.
    void write();
  }
}

export type AiUsageSummary = { calls: number; costUsd: number; byArea: Array<{ area: string; calls: number; costUsd: number }> };

export function summarizeAiUsage(rows: Array<UsageRow & { area: string }>): AiUsageSummary {
  const byArea = new Map<string, { calls: number; costUsd: number }>();
  let costUsd = 0;
  for (const r of rows) {
    const c = usageCostUsd(r);
    costUsd += c;
    const a = byArea.get(r.area) ?? { calls: 0, costUsd: 0 };
    a.calls += 1;
    a.costUsd += c;
    byArea.set(r.area, a);
  }
  return {
    calls: rows.length,
    costUsd,
    byArea: [...byArea.entries()].map(([area, v]) => ({ area, ...v })).sort((x, y) => y.costUsd - x.costUsd),
  };
}

type MonthGroup = {
  area: string;
  model: string;
  calls: number | string;
  input_tokens: number | string;
  output_tokens: number | string;
  cache_read_tokens: number | string;
  cache_write_tokens: number | string;
};

/** The month's totals from the database's sums per (area, model). */
export function summarizeGroups(groups: MonthGroup[]): AiUsageSummary {
  const byArea = new Map<string, { calls: number; costUsd: number }>();
  let calls = 0;
  let costUsd = 0;
  for (const g of groups) {
    const n = Number(g.calls) || 0;
    const c = usageCostUsd({
      model: g.model,
      input_tokens: Number(g.input_tokens) || 0,
      output_tokens: Number(g.output_tokens) || 0,
      cache_read_tokens: Number(g.cache_read_tokens) || 0,
      cache_write_tokens: Number(g.cache_write_tokens) || 0,
    });
    calls += n;
    costUsd += c;
    const a = byArea.get(g.area) ?? { calls: 0, costUsd: 0 };
    a.calls += n;
    a.costUsd += c;
    byArea.set(g.area, a);
  }
  return {
    calls,
    costUsd,
    byArea: [...byArea.entries()].map(([area, v]) => ({ area, ...v })).sort((x, y) => y.costUsd - x.costUsd),
  };
}

/**
 * This calendar month's calls (UTC), for /admin/pilot. Call after
 * requireAdmin(). Summed in the database (ai_usage_month(), schema block
 * 2026-11-15): a row read is capped at 1,000 and would undercount.
 */
export async function loadAiUsageThisMonth(now = new Date()): Promise<AiUsageSummary | null> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data, error } = await getSupabaseAdmin().rpc("ai_usage_month", { since: start });
  if (error) {
    console.error("[ai-usage] read failed", error.code);
    return null;
  }
  return summarizeGroups((data ?? []) as MonthGroup[]);
}
