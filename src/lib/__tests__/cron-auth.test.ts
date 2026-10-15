import { afterEach, describe, expect, it } from "vitest";
import { isAuthorizedCron } from "@/lib/cron-auth";

const req = (auth?: string) =>
  new Request("https://app.unreceipt.com/api/cron/retention", {
    headers: auth ? { authorization: auth } : {},
  });

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("isAuthorizedCron", () => {
  it("fails closed when CRON_SECRET isn't set", () => {
    expect(isAuthorizedCron(req("Bearer "))).toBe(false);
    expect(isAuthorizedCron(req())).toBe(false);
  });

  it("accepts only the exact bearer secret", () => {
    process.env.CRON_SECRET = "s3cret-value";
    expect(isAuthorizedCron(req("Bearer s3cret-value"))).toBe(true);
    expect(isAuthorizedCron(req("Bearer s3cret-valuX"))).toBe(false);
    expect(isAuthorizedCron(req("s3cret-value"))).toBe(false);
    expect(isAuthorizedCron(req())).toBe(false);
  });
});
