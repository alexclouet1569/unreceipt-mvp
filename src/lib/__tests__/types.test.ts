import { describe, expectTypeOf, it } from "vitest";
import type {
  Receipt,
  ReceiptCategory,
  ReceiptSource,
  Subscription,
  SubscriptionStatus,
} from "@/lib/types";

describe("Receipt type", () => {
  it("source is the captured | forwarded | uploaded union", () => {
    expectTypeOf<Receipt["source"]>().toEqualTypeOf<ReceiptSource>();
    expectTypeOf<ReceiptSource>().toEqualTypeOf<
      "captured" | "forwarded" | "uploaded"
    >();
  });

  it("category covers every value the admin paste form can pick", () => {
    expectTypeOf<Receipt["category"]>().toEqualTypeOf<ReceiptCategory>();
    expectTypeOf<ReceiptCategory>().toEqualTypeOf<
      | "meals"
      | "transport"
      | "accommodation"
      | "office_supplies"
      | "software"
      | "client_entertainment"
      | "travel"
      | "other"
    >();
  });

  it("required identity + denormalized columns are non-nullable strings", () => {
    expectTypeOf<Receipt["id"]>().toEqualTypeOf<string>();
    expectTypeOf<Receipt["user_id"]>().toEqualTypeOf<string>();
    expectTypeOf<Receipt["currency"]>().toEqualTypeOf<string>();
    expectTypeOf<Receipt["created_at"]>().toEqualTypeOf<string>();
    expectTypeOf<Receipt["updated_at"]>().toEqualTypeOf<string>();
  });

  it("transaction_id is nullable so forwarded-email receipts can omit it", () => {
    expectTypeOf<Receipt["transaction_id"]>().toEqualTypeOf<string | null>();
  });

  it("nullable extracted fields match the schema", () => {
    expectTypeOf<Receipt["merchant_name"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Receipt["total"]>().toEqualTypeOf<number | null>();
    expectTypeOf<Receipt["image_url"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Receipt["notes"]>().toEqualTypeOf<string | null>();
  });
});

describe("Subscription type", () => {
  it("status is the Stripe lifecycle union", () => {
    expectTypeOf<Subscription["status"]>().toEqualTypeOf<SubscriptionStatus>();
    expectTypeOf<SubscriptionStatus>().toEqualTypeOf<
      "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "unpaid"
    >();
  });

  it("Stripe ids are required strings; period boundaries are nullable", () => {
    expectTypeOf<Subscription["stripe_customer_id"]>().toEqualTypeOf<string>();
    expectTypeOf<Subscription["stripe_subscription_id"]>().toEqualTypeOf<string>();
    expectTypeOf<Subscription["current_period_end"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Subscription["trial_end"]>().toEqualTypeOf<string | null>();
  });

  it("accepts a representative literal value", () => {
    const sub: Subscription = {
      id: "11111111-1111-1111-1111-111111111111",
      user_id: "22222222-2222-2222-2222-222222222222",
      stripe_customer_id: "cus_test",
      stripe_subscription_id: "sub_test",
      status: "trialing",
      current_period_end: null,
      trial_end: "2026-05-05T00:00:00Z",
      created_at: "2026-04-28T00:00:00Z",
      updated_at: "2026-04-28T00:00:00Z",
    };
    expectTypeOf(sub).toEqualTypeOf<Subscription>();
  });
});
