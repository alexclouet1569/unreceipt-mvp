// High/critical advisories CI accepts for a limited time (scripts/audit-prod.mjs).
//
// Rules for an entry:
// - one GHSA id, and only where it is today: `paths` lists the exact install
//   paths from `npm audit --json` (`nodes`). The same advisory anywhere else
//   fails CI.
// - `until` at most 45 days after `added`. On that date CI fails again: check
//   for a fix, then remove the entry or renew it with a new reason.
// - only when no patched version exists, or the patch can't be installed yet.
//   A real upgrade always comes first.

/** @type {import("./audit-filter.mjs").AuditException[]} */
export const AUDIT_EXCEPTIONS = [
  {
    // picomatch ReDoS on single-branch repeated extglobs. Every version up to
    // 4.0.7 is affected and 4.0.7 is the newest published (checked
    // 2026-11-18), so no upgrade or `overrides` can fix it yet.
    // Where it comes from:
    // - @sentry/nextjs (11.14.0, the latest) pins @rollup/plugin-commonjs
    //   28.0.1, which with @rollup/pluginutils uses it. That is Sentry's
    //   build-time wrapping code; next.config.ts doesn't even call
    //   withSentryConfig, and its globs are our own config, never user input.
    // - vite / tinyglobby: vite is an optional peer of @sentry/cloudflare
    //   (inside @sentry/nextjs), present only because vitest needs it; npm
    //   then marks it devOptional and counts it as production. Nothing in
    //   the app imports vite, and no function trace includes it.
    // On the re-check date: look for picomatch > 4.0.7 (or a fixed advisory
    // range) and for a @sentry/nextjs that drops the plugin-commonjs pin.
    ghsa: "GHSA-fc5q-39xc-vjpf",
    added: "2026-11-18",
    until: "2026-12-18",
    reason: "No patched picomatch exists; only reachable from build/test tooling with our own globs.",
    paths: [
      "node_modules/@rollup/plugin-commonjs/node_modules/picomatch",
      "node_modules/@rollup/pluginutils/node_modules/picomatch",
      "node_modules/tinyglobby/node_modules/picomatch",
      "node_modules/vite/node_modules/picomatch",
    ],
  },
];
