import { describe, expect, it } from "vitest";
import { isDemoRequestHref } from "../_tour";

// The tours' end screens track "Book a demo" as cta_demo_page and every
// other main button as the sign-up: a demo link counted as a sign-up would
// skew the funnel numbers the founder reviews each week.
describe("isDemoRequestHref", () => {
  it("recognises both demo request pages", () => {
    expect(isDemoRequestHref("/book-demo")).toBe(true);
    expect(isDemoRequestHref("/sv/boka-demo")).toBe(true);
  });

  it("treats sign-up and other links as not the demo request", () => {
    expect(isDemoRequestHref("/app/login?mode=signup")).toBe(false);
    expect(isDemoRequestHref("https://app.unreceipt.com/app/login?mode=signup")).toBe(false);
    expect(isDemoRequestHref("/demo/accountant?step=1")).toBe(false);
  });
});
