// CI's dependency audit (.github/workflows/checks.yml, job "audit").
// Runs `npm audit --omit=dev --json` and fails on any high or critical
// advisory in what ships to production, except the dated, path-scoped
// exceptions in scripts/audit-allowlist.mjs. Prints everything it saw,
// allowed advisories included, so nothing is hidden.
//
//   node scripts/audit-prod.mjs

import { spawnSync } from "node:child_process";
import { AUDIT_EXCEPTIONS } from "./audit-allowlist.mjs";
import { evaluateAudit } from "./audit-filter.mjs";

const run = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

let report = null;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error("Could not read npm audit's output:");
  console.error(run.stderr || run.stdout);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const result = evaluateAudit(report, AUDIT_EXCEPTIONS, today);
const counts = report?.metadata?.vulnerabilities;
if (counts) console.log(`npm audit --omit=dev: ${JSON.stringify(counts)}`);

const line = (a) => `  ${a.severity.padEnd(8)} ${a.ghsa}  ${a.name}: ${a.title}\n           at ${a.nodes.join(", ")}`;

if (result.allowed.length > 0) {
  console.log("\nAllowed for now (scripts/audit-allowlist.mjs):");
  for (const a of result.allowed) console.log(`${line(a)}\n           re-check by ${a.until}`);
}
if (result.other.length > 0) {
  console.log("\nBelow the high threshold (not failing):");
  for (const a of result.other) console.log(line(a));
}
if (result.unused.length > 0) {
  console.log("\nExceptions that no longer match anything (remove them):");
  for (const e of result.unused) console.log(`  ${e.ghsa}`);
}
if (result.problems.length > 0) {
  console.log("\nProblems:");
  for (const p of result.problems) console.log(`  ${p}`);
}
if (result.blocking.length > 0) {
  console.log("\nFailing:");
  for (const a of result.blocking) console.log(`${line(a)}\n           ${a.why}`);
}

console.log(result.ok ? "\nAudit passed." : "\nAudit failed.");
process.exit(result.ok ? 0 : 1);
