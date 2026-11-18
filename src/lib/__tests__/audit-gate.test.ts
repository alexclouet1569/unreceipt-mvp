import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateAudit, invalidExceptions, sourceAdvisories } from "../../../scripts/audit-gate.mjs";

// Shape of `npm audit --omit=dev --json` (v2) on 2026-11-18, trimmed.
const PICOMATCH = {
  source: 1116000,
  name: "picomatch",
  dependency: "picomatch",
  title: "picomatch vulnerable to ReDoS through single-branch repeated extglobs",
  url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
  severity: "high",
  range: "<=4.0.7",
};
const MINIMATCH = {
  source: 1116001,
  name: "minimatch",
  dependency: "minimatch",
  title: "minimatch has potential denial of service via globparts amplification",
  url: "https://github.com/advisories/GHSA-g3hv-75wg-m249",
  severity: "moderate",
  range: ">=7.0.0 <11.0.1",
};

const PICOMATCH_NODES = [
  "node_modules/@rollup/plugin-commonjs/node_modules/picomatch",
  "node_modules/@rollup/pluginutils/node_modules/picomatch",
];

function report(extra: Record<string, unknown> = {}) {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      picomatch: { name: "picomatch", severity: "high", via: [PICOMATCH], nodes: PICOMATCH_NODES },
      fdir: { name: "fdir", severity: "high", via: ["picomatch"] },
      "@rollup/pluginutils": { name: "@rollup/pluginutils", severity: "high", via: ["picomatch"] },
      "@sentry/nextjs": { name: "@sentry/nextjs", severity: "high", via: ["@rollup/plugin-commonjs"] },
      minimatch: { name: "minimatch", severity: "moderate", via: [MINIMATCH] },
      ...extra,
    },
  };
}

const EXCEPTION = {
  id: "GHSA-fc5q-39xc-vjpf",
  package: "picomatch",
  nodes: PICOMATCH_NODES,
  severity: "high",
  reason: "Build-time only, no fixed release published yet.",
  added: "2026-11-18",
  reviewBy: "2027-01-31",
};

describe("audit gate", () => {
  it("counts source advisories only, not the chain that leads to them", () => {
    const ids = sourceAdvisories(report()).map((a) => a.id);
    expect(ids.sort()).toEqual(["GHSA-fc5q-39xc-vjpf", "GHSA-g3hv-75wg-m249"]);
  });

  it("fails on a high advisory without an exception, like --audit-level=high", () => {
    const result = evaluateAudit(report(), [], "2026-11-18");
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain("GHSA-fc5q-39xc-vjpf");
  });

  it("passes with a valid exception and reports it as accepted", () => {
    const result = evaluateAudit(report(), [EXCEPTION], "2026-11-18");
    expect(result.failures).toEqual([]);
    expect(result.accepted.map((a: { id: string }) => a.id)).toEqual(["GHSA-fc5q-39xc-vjpf"]);
    expect(result.below.map((a: { id: string }) => a.id)).toEqual(["GHSA-g3hv-75wg-m249"]);
  });

  it("still applies on the review date and fails the day after", () => {
    expect(evaluateAudit(report(), [EXCEPTION], "2027-01-31").failures).toEqual([]);
    const after = evaluateAudit(report(), [EXCEPTION], "2027-02-01");
    expect(after.failures[0]).toContain("expired");
  });

  it("fails when the advisory is raised above the accepted severity", () => {
    const critical = report({
      picomatch: { name: "picomatch", severity: "critical", via: [{ ...PICOMATCH, severity: "critical" }], nodes: PICOMATCH_NODES },
    });
    expect(evaluateAudit(critical, [EXCEPTION], "2026-11-18").failures[0]).toContain("raised above");
  });

  it("fails when the package turns up at an install path the exception doesn't list", () => {
    const moved = report({
      picomatch: { name: "picomatch", severity: "high", via: [PICOMATCH], nodes: [...PICOMATCH_NODES, "node_modules/picomatch"] },
    });
    const result = evaluateAudit(moved, [EXCEPTION], "2026-11-18");
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain("installed at node_modules/picomatch,");
  });

  it("refuses a severity name inherited from Object, which would never compare", () => {
    expect(invalidExceptions([{ ...EXCEPTION, severity: "toString" }])).toHaveLength(1);
    expect(invalidExceptions([{ ...EXCEPTION, severity: "__proto__" }])).toHaveLength(1);
    const critical = report({
      picomatch: { name: "picomatch", severity: "critical", via: [{ ...PICOMATCH, severity: "critical" }], nodes: PICOMATCH_NODES },
    });
    expect(evaluateAudit(critical, [{ ...EXCEPTION, severity: "toString" }], "2026-11-18").failures.length).toBeGreaterThan(0);
  });

  it("refuses an exception without install paths", () => {
    expect(invalidExceptions([{ ...EXCEPTION, nodes: [] }])).toHaveLength(1);
  });

  it("does not let an exception cover the same advisory in another package", () => {
    const other = report({ "other-glob": { name: "other-glob", severity: "high", via: [{ ...PICOMATCH, name: "other-glob" }] } });
    const result = evaluateAudit(other, [EXCEPTION], "2026-11-18");
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain("other-glob");
  });

  it("fails on any new high or critical advisory next to an accepted one", () => {
    const next = report({
      next: {
        name: "next",
        severity: "critical",
        via: [{ ...PICOMATCH, name: "next", url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", severity: "critical" }],
      },
    });
    const result = evaluateAudit(next, [EXCEPTION], "2026-11-18");
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain("GHSA-aaaa-bbbb-cccc");
  });

  it("reports an exception nothing matches any more", () => {
    const clean = { auditReportVersion: 2, vulnerabilities: {} };
    const result = evaluateAudit(clean, [EXCEPTION], "2026-11-18");
    expect(result.failures).toEqual([]);
    expect(result.unused).toEqual([EXCEPTION]);
  });

  it("fails when npm audit gave no report", () => {
    const result = evaluateAudit({ error: { code: "ENOTFOUND", summary: "registry unreachable" } }, [EXCEPTION], "2026-11-18");
    expect(result.failures[0]).toContain("registry unreachable");
  });

  it("refuses an exception without a reason or a review date", () => {
    const bare = { id: EXCEPTION.id, package: EXCEPTION.package, nodes: EXCEPTION.nodes, severity: EXCEPTION.severity, added: EXCEPTION.added };
    expect(invalidExceptions([bare]).length).toBeGreaterThanOrEqual(2);
    expect(evaluateAudit(report(), [bare], "2026-11-18").failures.length).toBeGreaterThan(0);
  });

  it("keeps the committed exceptions file valid", () => {
    const file = JSON.parse(readFileSync(path.resolve(__dirname, "../../../scripts/audit-exceptions.json"), "utf8"));
    expect(invalidExceptions(file)).toEqual([]);
  });
});
