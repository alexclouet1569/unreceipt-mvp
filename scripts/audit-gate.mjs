// Dependency audit gate for CI (.github/workflows/checks.yml, job "audit").
//
// Runs `npm audit --omit=dev --json` and fails on any high or critical
// advisory in what ships to production, like `npm audit --audit-level=high`,
// except the advisories listed in scripts/audit-exceptions.json. An exception
// names one advisory (GHSA id) in one package, the highest severity accepted,
// why, and a review date: after that date, or if the advisory is raised above
// the accepted severity, the gate fails again until someone re-checks it.
// Accepted advisories are printed in every run (and in the job summary), so
// nothing is hidden. An exception that no longer matches anything is reported
// so it can be deleted.
//
// By hand: node scripts/audit-gate.mjs   (or npm run audit:prod)
// Reads package-lock.json only; no install needed.

import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const FAIL_AT = SEVERITY_RANK.high;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "https://github.com/advisories/GHSA-xxxx" -> "GHSA-xxxx". */
function advisoryId(url) {
  return typeof url === "string" ? (url.split("/").pop() ?? url) : String(url);
}

/**
 * The source advisories in an `npm audit --json` report (v2 format), one per
 * advisory and package. Entries whose `via` is a package name are only the
 * chain leading to a source advisory and are not counted on their own.
 */
export function sourceAdvisories(report) {
  const seen = new Map();
  for (const vuln of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      if (typeof via !== "object" || via === null) continue;
      const id = advisoryId(via.url ?? via.source);
      const key = `${id}|${via.name}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        id,
        package: via.name,
        severity: via.severity,
        title: via.title,
        url: via.url,
        range: via.range,
      });
    }
  }
  return [...seen.values()];
}

/** Problems with the exceptions file itself; any of them fails the gate. */
export function invalidExceptions(exceptions) {
  if (!Array.isArray(exceptions)) return ["audit-exceptions.json must be an array"];
  const problems = [];
  exceptions.forEach((e, i) => {
    const where = `audit-exceptions.json entry ${i}`;
    if (!e || typeof e !== "object") return problems.push(`${where} is not an object`);
    if (typeof e.id !== "string" || !/^GHSA-[\w-]+$/.test(e.id)) problems.push(`${where}: id must be a GHSA id`);
    if (typeof e.package !== "string" || !e.package) problems.push(`${where}: package is required`);
    if (!(e.severity in SEVERITY_RANK)) problems.push(`${where}: severity must be one of ${Object.keys(SEVERITY_RANK).join(", ")}`);
    if (typeof e.reason !== "string" || e.reason.trim().length < 20) problems.push(`${where}: reason must explain why (20+ characters)`);
    if (typeof e.added !== "string" || !DATE.test(e.added)) problems.push(`${where}: added must be YYYY-MM-DD`);
    if (typeof e.reviewBy !== "string" || !DATE.test(e.reviewBy)) problems.push(`${where}: reviewBy must be YYYY-MM-DD`);
  });
  return problems;
}

/**
 * Decide the gate from a parsed report, the exceptions and today's date
 * (YYYY-MM-DD, UTC). `reviewBy` is the last day an exception still applies.
 */
export function evaluateAudit(report, exceptions, today) {
  const failures = [];
  const accepted = [];
  const below = [];

  if (!report || typeof report !== "object" || report.error || !report.vulnerabilities) {
    const message = report?.error?.summary ?? report?.error?.code ?? "no vulnerabilities field";
    return { failures: [`npm audit did not produce a report: ${message}`], accepted, below, unused: [] };
  }

  const invalid = invalidExceptions(exceptions);
  if (invalid.length > 0) return { failures: invalid, accepted, below, unused: [] };

  const used = new Set();
  for (const adv of sourceAdvisories(report)) {
    const rank = SEVERITY_RANK[adv.severity] ?? SEVERITY_RANK.critical;
    if (rank < FAIL_AT) {
      below.push(adv);
      continue;
    }
    const label = `${adv.id} (${adv.severity}) in ${adv.package} ${adv.range ?? ""}: ${adv.title ?? ""}`.trim();
    const exception = exceptions.find((e) => e.id === adv.id && e.package === adv.package);
    if (!exception) {
      failures.push(`${label} ${adv.url ?? ""}`.trim());
      continue;
    }
    used.add(exceptions.indexOf(exception));
    if (today > exception.reviewBy) {
      failures.push(`${label}: exception expired on ${exception.reviewBy}; re-check the advisory and renew or remove it`);
    } else if (rank > SEVERITY_RANK[exception.severity]) {
      failures.push(`${label}: raised above the accepted severity "${exception.severity}"; re-check it`);
    } else {
      accepted.push({ ...adv, reviewBy: exception.reviewBy, reason: exception.reason });
    }
  }

  const unused = exceptions.filter((_, i) => !used.has(i));
  return { failures, accepted, below, unused };
}

function runNpmAudit() {
  const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  // npm audit exits 1 when it finds anything; the JSON on stdout is the answer.
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { error: { summary: `unreadable output (exit ${result.status}): ${result.stderr.slice(0, 500)}` } };
  }
}

function main() {
  const exceptions = JSON.parse(readFileSync(new URL("./audit-exceptions.json", import.meta.url), "utf8"));
  const today = new Date().toISOString().slice(0, 10);
  const { failures, accepted, below, unused } = evaluateAudit(runNpmAudit(), exceptions, today);
  const gha = process.env.GITHUB_ACTIONS === "true";
  const summary = [];

  for (const a of accepted) {
    const line = `Accepted until ${a.reviewBy}: ${a.id} (${a.severity}) in ${a.package} ${a.range ?? ""}. ${a.title ?? ""}`;
    console.log(gha ? `::warning title=Known advisory (excepted)::${line}` : `ACCEPTED  ${line}`);
    summary.push(`| ${a.id} | ${a.package} | ${a.severity} | ${a.reviewBy} | ${a.reason.replace(/\|/g, "\\|")} |`);
  }
  for (const e of unused) {
    const line = `${e.id} in ${e.package} is no longer reported by npm audit; delete it from scripts/audit-exceptions.json`;
    console.log(gha ? `::warning title=Unused audit exception::${line}` : `UNUSED    ${line}`);
  }
  if (below.length > 0) {
    console.log(`${below.length} advisory(ies) below high, not gating: ${below.map((b) => `${b.id} ${b.package} (${b.severity})`).join(", ")}`);
  }
  for (const f of failures) console.log(gha ? `::error title=Dependency audit::${f}` : `FAIL      ${f}`);

  if (gha && process.env.GITHUB_STEP_SUMMARY && accepted.length > 0) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      ["### Dependency audit: accepted advisories", "", "| Advisory | Package | Severity | Review by | Why |", "|---|---|---|---|---|", ...summary, ""].join("\n")
    );
  }

  if (failures.length > 0) {
    console.log(`\nDependency audit failed: ${failures.length} problem(s).`);
    process.exit(1);
  }
  console.log(`\nDependency audit passed (no high or critical advisory outside ${accepted.length} accepted exception(s)).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
