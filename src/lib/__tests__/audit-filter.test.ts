import { describe, expect, it } from "vitest";
import { AUDIT_EXCEPTIONS } from "../../../scripts/audit-allowlist.mjs";
import { checkExceptions, evaluateAudit } from "../../../scripts/audit-filter.mjs";

const GHSA = "GHSA-fc5q-39xc-vjpf";
const PATH = "node_modules/@rollup/pluginutils/node_modules/picomatch";

function report(nodes: string[], severity = "high", url = `https://github.com/advisories/${GHSA}`) {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      picomatch: {
        name: "picomatch",
        severity,
        via: [{ source: 1, name: "picomatch", title: "ReDoS", url, severity, range: "<=4.0.7" }],
        nodes,
      },
      // Inherits the severity only: must not count as a second advisory.
      "@rollup/pluginutils": { name: "@rollup/pluginutils", severity, via: ["picomatch"], nodes: ["node_modules/@rollup/pluginutils"] },
    },
    metadata: { vulnerabilities: { high: 2 } },
  };
}

const exception = {
  ghsa: GHSA,
  added: "2026-11-18",
  until: "2026-12-18",
  reason: "no patched version",
  paths: [PATH],
};

describe("evaluateAudit", () => {
  it("passes an allowed advisory at an allowed path before the re-check date", () => {
    const r = evaluateAudit(report([PATH]), [exception], "2026-11-18");
    expect(r.ok).toBe(true);
    expect(r.allowed.map((a) => a.ghsa)).toEqual([GHSA]);
    expect(r.blocking).toEqual([]);
  });

  it("fails once the exception has expired", () => {
    const r = evaluateAudit(report([PATH]), [exception], "2026-12-18");
    expect(r.ok).toBe(false);
    expect(r.blocking[0].why).toMatch(/expired/);
  });

  it("fails when the advisory shows up at another path", () => {
    const r = evaluateAudit(report([PATH, "node_modules/picomatch"]), [exception], "2026-11-20");
    expect(r.ok).toBe(false);
    expect(r.blocking[0].why).toMatch(/node_modules\/picomatch$/);
  });

  it("fails on a high advisory without an exception", () => {
    const r = evaluateAudit(report([PATH], "high", "https://github.com/advisories/GHSA-aaaa-bbbb-cccc"), [exception], "2026-11-20");
    expect(r.ok).toBe(false);
    expect(r.blocking[0].why).toBe("no exception");
    expect(r.unused).toEqual([exception]);
  });

  it("does not fail on a moderate advisory", () => {
    const r = evaluateAudit(report([PATH], "moderate", "https://github.com/advisories/GHSA-aaaa-bbbb-cccc"), [], "2026-11-20");
    expect(r.ok).toBe(true);
    expect(r.other).toHaveLength(1);
  });

  it("fails when npm audit gave no report", () => {
    expect(evaluateAudit({ error: { code: "ENOTFOUND" } }, [], "2026-11-20").ok).toBe(false);
  });
});

describe("audit exceptions", () => {
  it("rejects an exception longer than 45 days or without paths", () => {
    expect(checkExceptions([{ ...exception, until: "2027-03-01" }])).toHaveLength(1);
    expect(checkExceptions([{ ...exception, paths: [] }])).toHaveLength(1);
  });

  it("keeps every committed exception dated, scoped and short", () => {
    expect(checkExceptions(AUDIT_EXCEPTIONS)).toEqual([]);
  });
});
