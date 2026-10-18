#!/usr/bin/env node
// Side-by-side summary of every variant in a receipt-ocr flow directory:
// accuracy per field, cost, latency and failures. Writes comparison.md next to
// the variants and prints it.
//
//   node evals/receipt-ocr/compare.mjs .claude/hillclimb/receipt-ocr

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const flow = process.argv[2] ?? ".claude/hillclimb/receipt-ocr";
const state = JSON.parse(readFileSync(join(flow, "_state.json"), "utf8"));
const METRICS = state.metrics.map((m) => m.id);
const PRICES = state.prices ?? {};

const readJsonl = (p) =>
  existsSync(p)
    ? readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l))
    : [];

const variants = readdirSync(flow)
  .filter((d) => /^(baseline|v\d+)$/.test(d))
  .sort((a, b) => (a === "baseline" ? -1 : b === "baseline" ? 1 : +a.slice(1) - +b.slice(1)));

function costOf(row) {
  const p = PRICES[row.model];
  if (!p || !row.usage) return null;
  const u = row.usage;
  return (
    ((u.input_tokens ?? 0) * p.in +
      (u.cache_creation_input_tokens ?? 0) * p.in * 1.25 +
      (u.cache_read_input_tokens ?? 0) * p.in * 0.1 +
      (u.output_tokens ?? 0) * p.out) /
    1e6
  );
}

const pct = (xs) => (xs.length ? `${Math.round((100 * xs.reduce((s, x) => s + x, 0)) / xs.length)}%` : "–");
const quantile = (xs, q) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
// 95% Wilson interval, so a 3-point gap on 34 cases isn't read as a win.
function wilson(k, n) {
  if (!n) return "";
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return `${Math.round(100 * (c - h))}–${Math.round(100 * (c + h))}%`;
}

const summaries = variants.map((v) => {
  const rows = readJsonl(join(flow, v, "results.jsonl"));
  const errors = readJsonl(join(flow, v, "errors.jsonl"));
  const changeFile = join(flow, v, "change.md");
  const label = existsSync(changeFile)
    ? readFileSync(changeFile, "utf8").split("\n").find((l) => l.trim() && !l.startsWith("#"))?.trim()
    : v === "baseline"
      ? "Production today"
      : v;
  const byMetric = Object.fromEntries(METRICS.map((m) => [m, rows.filter((r) => r.grade?.[m] != null).map((r) => r.grade[m])]));
  const costs = rows.map(costOf).filter((c) => c != null);
  const lat = rows.map((r) => r.latency_s).filter((x) => x != null);
  const correctK = byMetric.correct.reduce((s, x) => s + x, 0);
  const byTag = {};
  for (const r of rows) for (const t of r.tags ?? []) (byTag[t] ??= []).push(r.grade?.correct ?? 0);
  return {
    v,
    label,
    models: [...new Set(rows.map((r) => r.model))].join(", "),
    n: rows.length,
    errors: errors.length,
    truncated: rows.filter((r) => r.stop_reason === "max_tokens").length,
    unusable: rows.filter((r) => r.output_error).length,
    byMetric,
    ci: wilson(correctK, byMetric.correct.length),
    costPerReceipt: costs.length ? costs.reduce((s, c) => s + c, 0) / costs.length : null,
    p50: quantile(lat, 0.5),
    p90: quantile(lat, 0.9),
    byTag,
    misses: rows.filter((r) => r.grade?.correct === 0).map((r) => `\`${r.prompt_id}\`${r.rep ? ` (rep ${r.rep})` : ""}: ${r.explanation?.correct ?? ""}`),
  };
});

const out = [];
out.push(`# Receipt OCR model comparison`, "", `Flow: \`${flow}\` · generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, "");
out.push("## Accuracy", "");
out.push(`| Variant | Model | Scored | ${state.metrics.map((m) => m.label).join(" | ")} | 95% CI (Correct) |`);
out.push(`|---|---|---|${state.metrics.map(() => "---").join("|")}|---|`);
for (const s of summaries) {
  out.push(`| ${s.v}: ${s.label} | ${s.models} | ${s.n} | ${METRICS.map((m) => pct(s.byMetric[m])).join(" | ")} | ${s.ci} |`);
}
out.push("", "Correct = total, currency and date all right on a receipt, or a non-receipt flagged as one.", "");
out.push("## Cost, speed, failures", "");
out.push("| Variant | $ / receipt | $ / 1,000 receipts | Latency p50 | Latency p90 | Cut off (max_tokens) | Unusable output | API errors |");
out.push("|---|---|---|---|---|---|---|---|");
for (const s of summaries) {
  const c = s.costPerReceipt;
  out.push(
    `| ${s.v} | ${c == null ? "–" : `$${c.toFixed(4)}`} | ${c == null ? "–" : `$${(c * 1000).toFixed(2)}`} | ${s.p50 == null ? "–" : `${s.p50.toFixed(1)} s`} | ${s.p90 == null ? "–" : `${s.p90.toFixed(1)} s`} | ${s.truncated} | ${s.unusable} | ${s.errors} |`,
  );
}
const tags = [...new Set(summaries.flatMap((s) => Object.keys(s.byTag)))].sort();
out.push("", "## Correct, by tag", "");
out.push(`| Tag | ${summaries.map((s) => s.v).join(" | ")} |`, `|---|${summaries.map(() => "---").join("|")}|`);
for (const t of tags) out.push(`| ${t} | ${summaries.map((s) => `${pct(s.byTag[t] ?? [])} (${(s.byTag[t] ?? []).length})`).join(" | ")} |`);
out.push("", "## Misses", "");
for (const s of summaries) {
  out.push(`### ${s.v}: ${s.label}`, "");
  out.push(...(s.misses.length ? s.misses.map((m) => `- ${m}`) : ["- none"]), "");
}
const md = out.join("\n");
writeFileSync(join(flow, "comparison.md"), md + "\n");
console.log(md);
