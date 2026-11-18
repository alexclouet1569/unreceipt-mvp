import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_REQUEST_COPY } from "@/app/_demo-request-copy";
import { demoBookingUrl, DEMO_REQUEST_LOCALES } from "@/lib/demo-request";
import { demoRequestSchema } from "@/lib/demo-request-schema";
import { demoRequestLang, demoRequestPath } from "@/lib/marketing-pages";

describe("demoBookingUrl", () => {
  const prefill = { name: "Maja Berg", email: "maja@example.se" };

  it("prefills name and email on Cal.com hosts", () => {
    expect(demoBookingUrl("https://cal.eu/founder/demo", prefill)).toBe(
      "https://cal.eu/founder/demo?name=Maja+Berg&email=maja%40example.se"
    );
    expect(demoBookingUrl("https://cal.com/founder/demo?duration=20", prefill)).toBe(
      "https://cal.com/founder/demo?duration=20&name=Maja+Berg&email=maja%40example.se"
    );
    expect(demoBookingUrl("https://app.cal.eu/founder", prefill)).toContain("name=Maja+Berg");
  });

  it("gives other hosts the plain link", () => {
    expect(demoBookingUrl("https://calendly.com/founder", prefill)).toBe("https://calendly.com/founder");
    // A look-alike host is not Cal.com.
    expect(demoBookingUrl("https://evilcal.com/x", prefill)).toBe("https://evilcal.com/x");
    expect(demoBookingUrl("https://cal.com.evil.example/x", prefill)).toBe("https://cal.com.evil.example/x");
  });

  it("returns null without a usable https URL", () => {
    expect(demoBookingUrl(undefined)).toBeNull();
    expect(demoBookingUrl("")).toBeNull();
    expect(demoBookingUrl("  ")).toBeNull();
    expect(demoBookingUrl("cal.eu/founder")).toBeNull();
    expect(demoBookingUrl("http://cal.eu/founder")).toBeNull();
    expect(demoBookingUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("demoRequestSchema", () => {
  const base = {
    name: "Maja",
    company: "Nordljus AB",
    email: "maja@example.se",
    employees: "2-5",
    bookkeeping: "bokio",
    hasAccountant: false,
    locale: "en",
  };

  it("accepts the smallest valid request and nulls the optional fields", () => {
    const parsed = demoRequestSchema.parse(base);
    expect(parsed.phone).toBeNull();
    expect(parsed.message).toBeNull();
  });

  it("accepts the limits and refuses one more", () => {
    expect(demoRequestSchema.safeParse({ ...base, name: "x".repeat(100) }).success).toBe(true);
    expect(demoRequestSchema.safeParse({ ...base, name: "x".repeat(101) }).success).toBe(false);
    expect(demoRequestSchema.safeParse({ ...base, message: "x".repeat(2000) }).success).toBe(true);
    expect(demoRequestSchema.safeParse({ ...base, phone: "1".repeat(41) }).success).toBe(false);
    expect(demoRequestSchema.safeParse({ ...base, phone: "08-123 45" }).success).toBe(true);
    expect(demoRequestSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
  });

  it("refuses a whitespace-only name or company", () => {
    expect(demoRequestSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
    expect(demoRequestSchema.safeParse({ ...base, company: "\n" }).success).toBe(false);
  });
});

describe("demo request page", () => {
  it("leads French visitors to the English page and the others to their own", () => {
    expect(demoRequestPath("en")).toBe("/book-demo");
    expect(demoRequestPath("sv")).toBe("/sv/boka-demo");
    expect(demoRequestPath("fr")).toBe("/book-demo");
    expect(demoRequestLang("fr")).toBe("en");
    expect(demoRequestLang("sv")).toBe("sv");
  });

  it("keeps search titles and descriptions to a length Google shows", () => {
    for (const locale of DEMO_REQUEST_LOCALES) {
      const { title, description } = DEMO_REQUEST_COPY[locale].meta;
      expect(title.length, title).toBeLessThanOrEqual(80);
      expect(description.length, description).toBeLessThanOrEqual(220);
    }
  });
});

describe("demo CTAs", () => {
  // Every "Book a demo" goes to the demo page: a mailto: link does nothing
  // for webmail and phone users, and can't be measured. The footer's
  // support "Contact" is not a demo CTA and comes from SUPPORT_MAILTO.
  const files = [
    "src/app/_audience-page.tsx",
    "src/app/_audience-copy.ts",
    "src/app/_site-chrome.tsx",
    "src/app/_about-page.tsx",
    "src/app/_landing.tsx",
    "src/app/_demo-request-page.tsx",
    "src/app/demo/_tour.tsx",
    "src/app/demo/company/_company-tour.tsx",
    "src/app/demo/accountant/_accountant-tour.tsx",
  ];

  it("never uses a mailto: link on a marketing or tour page", () => {
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toContain("mailto:");
    }
  });
});
