import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Source-level guards for the marketing site (AGENTS.md "Languages"):
// each part of the site has its own root layout, marketing pages are
// prerendered, and the browser gets one language's copy at a time.

const APP = join(process.cwd(), "src/app");
const MARKETING_ROOTS = ["(en)", "sv", "fr"].map((d) => join(APP, d));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const read = (file: string) => readFileSync(file, "utf8");
const isClient = (src: string) => /^\s*["']use client["']/.test(src);

describe("root layouts", () => {
  it("has no single top-level layout: each part of the site brings its own <html>", () => {
    expect(existsSync(join(APP, "layout.tsx"))).toBe(false);
  });

  it("gives every top-level page folder a root layout", () => {
    // Route handlers (api, icons, llms…) need none; pages do, or the build fails
    // with an error that is easy to miss on a branch merged from elsewhere.
    for (const name of readdirSync(APP)) {
      const dir = join(APP, name);
      if (!statSync(dir).isDirectory() || name.startsWith("_") || name === "__tests__") continue;
      const pages = walk(dir).filter((f) => /\/page\.tsx$/.test(f));
      if (pages.length === 0) continue;
      expect(existsSync(join(dir, "layout.tsx")), `src/app/${name} needs a root layout (English marketing pages go in (en)/)`).toBe(true);
    }
    expect(existsSync(join(APP, "page.tsx")), "the home page lives in (en)/").toBe(false);
  });

  it("sets the language of each marketing root layout in the server HTML", () => {
    expect(read(join(APP, "(en)/layout.tsx"))).toContain('lang="en"');
    expect(read(join(APP, "sv/layout.tsx"))).toContain('lang="sv"');
    expect(read(join(APP, "fr/layout.tsx"))).toContain('lang="fr"');
  });
});

describe("marketing pages are prerendered", () => {
  it("marks every marketing root layout static-or-fail", () => {
    for (const root of MARKETING_ROOTS) {
      expect(read(join(root, "layout.tsx"))).toMatch(/export const dynamic = "error";/);
    }
  });

  it("never opts a marketing page back into per-request rendering", () => {
    for (const file of MARKETING_ROOTS.flatMap(walk).filter((f) => /\.tsx?$/.test(f))) {
      const src = read(file);
      const name = relative(APP, file);
      expect(src, name).not.toMatch(/force-dynamic|revalidate\s*=\s*0/);
      expect(src, name).not.toMatch(/from "next\/headers"/);
    }
  });
});

describe("client components ship one language", () => {
  // Modules holding every language's copy. A client component may import
  // their types, never their values: the page passes one language as props.
  const ALL_LANGUAGE_MODULES = [
    "_landing-copy",
    "_site-copy",
    "_audience-copy",
    "_receipt-text",
    "_site-chrome",
    "@/lib/faq",
    "@/lib/guides",
    "@/lib/about",
  ];

  it("keeps multi-language copy out of the marketing client components", () => {
    const shared = readdirSync(APP)
      .filter((n) => n.startsWith("_") && /\.tsx?$/.test(n))
      .map((n) => join(APP, n));
    const clientFiles = shared.filter((f) => isClient(read(f)));
    expect(clientFiles.map((f) => relative(APP, f))).toContain("_landing.tsx");
    for (const file of clientFiles) {
      const valueImports = read(file)
        .split("\n")
        .filter((l) => /^import\s/.test(l) && !/^import type\s/.test(l));
      for (const mod of ALL_LANGUAGE_MODULES) {
        const hit = valueImports.find((l) => l.includes(`"./${mod}"`) || l.includes(`"${mod}"`) || l.includes(`"@/app/${mod}"`));
        expect(hit, `${relative(APP, file)} imports ${mod}`).toBeUndefined();
      }
    }
  });
});
