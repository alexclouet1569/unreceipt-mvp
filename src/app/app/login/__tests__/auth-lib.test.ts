import { describe, expect, it } from "vitest";
import { resendAsSignInCode } from "../_auth-lib";

describe("resendAsSignInCode", () => {
  it("re-sends the sign-up email only for a genuinely new account", () => {
    expect(resendAsSignInCode({ purpose: "signup" })).toBe(false);
  });

  it("asks for a sign-in code when the address already had an account (a sign-up resend sends nothing)", () => {
    expect(resendAsSignInCode({ purpose: "signup", existingAccount: true })).toBe(true);
  });

  it("asks for a sign-in code for every sign-in", () => {
    expect(resendAsSignInCode({ purpose: "signin" })).toBe(true);
  });
});
