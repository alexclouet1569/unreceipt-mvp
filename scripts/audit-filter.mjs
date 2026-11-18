// Decides whether `npm audit --omit=dev --json` should fail CI.
// Pure: no I/O, so src/lib/__tests__/audit-filter.test.ts can test it.
// The runner is scripts/audit-prod.mjs; the exceptions live in
// scripts/audit-allowlist.mjs.

const BLOCKING = new Set(["high", "critical"]);
const DAY_MS = 24 * 60 * 60 * 1000;
/** The longest an exception may run before someone must look again. */
export const MAX_EXCEPTION_DAYS = 45;

/**
 * @typedef {{ ghsa: string, added: string, until: string, reason: string,
 *   paths: string[] }} AuditException
 * @typedef {{ ghsa: string, name: string, severity: string, title: string,
 *   url: string, nodes: string[] }} Advisory
 */

/** "https://github.com/advisories/GHSA-xxxx-xxxx-xxxx" → "GHSA-xxxx-xxxx-xxxx" */
export function ghsaOf(url) {
  return String(url ?? "").match(/GHSA(?:-[0-9a-z]{4}){3}/i)?.[0] ?? "";
}

/**
 * Every advisory in an npm audit report (format 2), once per package. The
 * other entries in `vulnerabilities` only inherit a severity from these.
 * @returns {Advisory[]}
 */
export function advisoriesOf(report) {
  const vulns = report?.vulnerabilities ?? {};
  const seen = new Map();
  for (const entry of Object.values(vulns)) {
    for (const via of entry?.via ?? []) {
      if (!via || typeof via !== "object") continue;
      const ghsa = ghsaOf(via.url) || `npm-${via.source}`;
      const key = `${ghsa}|${via.name}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        ghsa,
        name: String(via.name),
        severity: String(via.severity),
        title: String(via.title ?? ""),
        url: String(via.url ?? ""),
        nodes: [...(vulns[via.name]?.nodes ?? [])],
      });
    }
  }
  return [...seen.values()];
}

/** Problems with the exception list itself (bad dates, too long, no paths). */
export function checkExceptions(/** @type {AuditException[]} */ exceptions) {
  const problems = [];
  for (const e of exceptions) {
    const added = Date.parse(`${e.added}T00:00:00Z`);
    const until = Date.parse(`${e.until}T00:00:00Z`);
    if (!/^GHSA(-[0-9a-z]{4}){3}$/i.test(e.ghsa)) problems.push(`${e.ghsa}: not a GHSA id`);
    if (Number.isNaN(added) || Number.isNaN(until)) problems.push(`${e.ghsa}: added/until must be YYYY-MM-DD`);
    else if (until <= added || until - added > MAX_EXCEPTION_DAYS * DAY_MS)
      problems.push(`${e.ghsa}: until must be 1 to ${MAX_EXCEPTION_DAYS} days after added`);
    if (!e.reason?.trim()) problems.push(`${e.ghsa}: reason is empty`);
    if (!Array.isArray(e.paths) || e.paths.length === 0) problems.push(`${e.ghsa}: no allowed paths`);
  }
  return problems;
}

/**
 * @param {unknown} report  parsed `npm audit --omit=dev --json`
 * @param {AuditException[]} exceptions
 * @param {string} today  YYYY-MM-DD (UTC)
 * @returns {{ ok: boolean, blocking: Array<Advisory & { why: string }>,
 *   allowed: Array<Advisory & { until: string }>, other: Advisory[],
 *   unused: AuditException[], problems: string[] }}
 */
export function evaluateAudit(report, exceptions, today) {
  const problems = checkExceptions(exceptions);
  if (!report || typeof report !== "object" || !("vulnerabilities" in report)) {
    problems.push("npm audit returned no report (registry error?)");
  }
  const blocking = [];
  const allowed = [];
  const other = [];
  const used = new Set();
  for (const adv of advisoriesOf(report)) {
    if (!BLOCKING.has(adv.severity)) {
      other.push(adv);
      continue;
    }
    const exception = exceptions.find((e) => e.ghsa.toLowerCase() === adv.ghsa.toLowerCase());
    if (!exception) {
      blocking.push({ ...adv, why: "no exception" });
      continue;
    }
    used.add(exception);
    if (today >= exception.until) {
      blocking.push({ ...adv, why: `exception expired on ${exception.until}: re-check it` });
      continue;
    }
    const outside = adv.nodes.filter((n) => !exception.paths.includes(n));
    if (outside.length > 0 || adv.nodes.length === 0) {
      blocking.push({ ...adv, why: `found outside the allowed paths: ${outside.join(", ") || "(no path)"}` });
      continue;
    }
    allowed.push({ ...adv, until: exception.until });
  }
  const unused = exceptions.filter((e) => !used.has(e));
  return { ok: blocking.length === 0 && problems.length === 0, blocking, allowed, other, unused, problems };
}
