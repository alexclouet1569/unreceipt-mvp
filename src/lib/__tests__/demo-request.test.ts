import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_REQUEST_COPY } from "@/app/_demo-request-copy";
import { demoBookingUrl, DEMO_REQUEST_LOCALES } from "@/lib/demo-request";
import { demoRequestSchema } from "@/lib/demo-request-schema";
import { CONTACT_COPY } from "@/app/_contact-copy";
import { demoRequestLang, demoRequestPath, pagePath } from "@/lib/marketing-pages";

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
  it("leads every visitor to the page in their own language", () => {
    expect(demoRequestPath("en")).toBe("/book-demo");
    expect(demoRequestPath("sv")).toBe("/sv/boka-demo");
    expect(demoRequestPath("fr")).toBe("/fr/demander-une-demo");
    expect(demoRequestLang("fr")).toBe("fr");
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

describe("contact page", () => {
  const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

  it("is where the footer's Contact leads, in each language", () => {
    expect(pagePath("contact", "en")).toBe("/contact");
    expect(pagePath("contact", "sv")).toBe("/sv/kontakt");
    expect(pagePath("contact", "fr")).toBe("/fr/contact");
    expect(read("src/app/_site-chrome.tsx")).toContain('href: pagePath("contact", locale)');
  });

  it("asks only for a name, an email, a reason and a message", () => {
    const parsed = demoRequestSchema.parse({
      kind: "contact",
      name: "Jonas",
      email: "jonas@example.se",
      topic: "press",
      message: "Hello",
      locale: "en",
    });
    expect(parsed).toMatchObject({ company: null, topic: "press", employees: null, hasAccountant: null });
  });

  it("drops a topic sent with the other kinds", () => {
    const parsed = demoRequestSchema.parse({
      kind: "question",
      name: "Jonas",
      company: "Ek AB",
      email: "jonas@example.se",
      topic: "press",
      message: "Hello",
      locale: "en",
    });
    expect(parsed.topic).toBeNull();
  });

  it("keeps search titles and descriptions to a length Google shows", () => {
    for (const locale of DEMO_REQUEST_LOCALES) {
      const { title, description } = CONTACT_COPY[locale].meta;
      expect(title.length, title).toBeLessThanOrEqual(80);
      expect(description.length, description).toBeLessThanOrEqual(220);
    }
  });

  it("gives the form one language's copy as props, never the module of all three", () => {
    expect(read("src/app/_contact-form.tsx")).not.toMatch(/import \{[^}]*\bCONTACT_COPY\b/);
  });
});

describe("demo CTAs", () => {
  // Every "Book a demo" goes to the demo page: a mailto: link does nothing
  // for webmail and phone users, and can't be measured. The footer's
  // "Contact" goes to the contact page's form for the same reason.
  const files = [
    "src/app/_audience-page.tsx",
    "src/app/_audience-copy.ts",
    "src/app/_site-chrome.tsx",
    "src/app/_about-page.tsx",
    "src/app/_landing.tsx",
    "src/app/_demo-request-page.tsx",
    "src/app/_contact-page.tsx",
    "src/app/_contact-form.tsx",
    "src/app/_contact-copy.ts",
    "src/lib/support-contact.ts",
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

describe("the contact form at the end of the pages", () => {
  const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

  it("ends the home and audience pages", () => {
    expect(read("src/app/_landing-page.tsx")).toContain("<ContactSection");
    expect(read("src/app/_audience-page.tsx")).toContain("<ContactSection");
    // The English waitlist it replaced is gone from the page.
    expect(read("src/app/_landing.tsx")).not.toContain("/api/waitlist");
  });

  it("gets one language's copy as props, never the module of all three", () => {
    for (const file of ["src/app/_demo-request-form.tsx", "src/app/_contact-section.tsx", "src/app/_landing.tsx"]) {
      expect(read(file), file).not.toMatch(/import \{[^}]*\bDEMO_REQUEST_COPY\b/);
    }
  });

  it("asks for a demo only, and sends anything else to the contact page", () => {
    const form = read("src/app/_demo-request-form.tsx");
    expect(form).toContain('kind: "demo"');
    expect(form).toContain('pagePath("contact", locale)');
    expect(form).not.toContain('name="kind"');
    for (const locale of DEMO_REQUEST_LOCALES) {
      const { contactLead, contactLink } = DEMO_REQUEST_COPY[locale].form;
      expect(contactLead.length).toBeGreaterThan(0);
      expect(contactLink.length).toBeGreaterThan(0);
    }
    // The route still takes a demo with no kind (older clients).
    const parsed = demoRequestSchema.safeParse({
      name: "Maja",
      company: "Nordljus AB",
      email: "maja@example.se",
      employees: "2-5",
      bookkeeping: "fortnox",
      hasAccountant: true,
      locale: "sv",
    });
    expect(parsed.success && parsed.data.kind).toBe("demo");
  });
});

describe("the closed demo tour", () => {
  // Founder decision 2026-11-18: no public way into /demo; visitors book a
  // demo instead (the proxy sends /demo there).
  it("is linked from no marketing page", () => {
    const files = [
      "src/app/_landing.tsx",
      "src/app/_landing-page.tsx",
      "src/app/_audience-page.tsx",
      "src/app/_audience-copy.ts",
      "src/app/_guide-page.tsx",
      "src/lib/guides.ts",
      "src/app/_site-chrome.tsx",
      "src/app/_demo-request-page.tsx",
      "src/app/_contact-section.tsx",
      "src/app/_about-page.tsx",
      "src/app/llms.txt/route.ts",
      "src/app/llms-full.txt/route.ts",
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/["'`(]\/demo(\/|\?|["'`)])/);
      expect(source, file).not.toMatch(/app\.unreceipt\.com\/demo/);
    }
  });
});

