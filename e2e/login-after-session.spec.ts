import { expect, test, type Page } from "@playwright/test";

const USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "alex@example.se",
  aud: "authenticated",
  role: "authenticated",
};

// Header { alg: HS256, typ: JWT } · payload { sub, email, role, aud, exp: 9999999999 }
function fakeJwt(): string {
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return [
    b64({ alg: "HS256", typ: "JWT" }),
    b64({ sub: USER.id, email: USER.email, role: "authenticated", aud: "authenticated", exp: 9999999999 }),
    "ZmFrZS1zaWduYXR1cmU",
  ].join(".");
}

function session() {
  return {
    access_token: fakeJwt(),
    refresh_token: "fake-refresh",
    expires_in: 3600,
    expires_at: 9999999999,
    token_type: "bearer",
    user: USER,
  };
}

// Supabase Auth stub. The restored cookie session is rejected (as after a
// sign-out elsewhere or a revoked token) until the user signs in again.
async function stubAuth(page: Page) {
  let signedIn = false;
  await page.route(/^https:\/\/test\.supabase\.co\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/v1/user")) {
      return signedIn
        ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(USER) })
        : route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ code: "session_not_found", message: "Session from session_id claim in JWT does not exist" }),
          });
    }
    if (url.pathname.endsWith("/auth/v1/token")) {
      signedIn = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session()) });
    }
    if (url.pathname.endsWith("/auth/v1/logout")) {
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

async function seedSessionCookie(page: Page, baseURL: string) {
  // Same cookie shape @supabase/ssr writes.
  await page.context().addCookies([
    {
      name: "sb-test-auth-token",
      value: encodeURIComponent(JSON.stringify(session())),
      domain: new URL(baseURL).hostname,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

/**
 * Regression: ClientShell's onAuthStateChange callback awaited
 * supabase.auth.getUser(). supabase-js runs that callback while holding its
 * auth lock when it restores a session on page load, and getUser() waits for
 * the same lock, so the browser client deadlocked whenever the page loaded
 * with an sb-* cookie. The next signInWithPassword then never resolved and
 * the form showed "Sign-in is taking too long. Reload the page".
 */
test.describe("sign-in with a leftover session cookie", () => {
  test("the restored session is checked against Supabase", async ({ page, baseURL }) => {
    await stubAuth(page);
    await seedSessionCookie(page, baseURL ?? "http://localhost:3000");

    const checked = page.waitForRequest((r) => r.url().endsWith("/auth/v1/user"), { timeout: 5_000 });
    await page.goto("/app/login");
    await checked;
  });

  test("password sign-in reaches /app without a reload", async ({ page, baseURL }) => {
    await stubAuth(page);
    await seedSessionCookie(page, baseURL ?? "http://localhost:3000");
    await page.goto("/app/login");

    await page.getByLabel("Email address").first().fill(USER.email);
    await page.getByLabel("Password", { exact: true }).fill("correct-horse");

    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    // The old deadlock held the button on "Signing in..." until the 12 s
    // timeout and never left the form. Without the server-side Supabase this
    // test can't render the dashboard itself, so reaching the /app URL is the
    // pass condition. The wait covers the dev server's first compile of /app.
    await page.waitForURL(/\/app$/, { timeout: 15_000 });
    await expect(page.getByText(/taking too long/i)).toHaveCount(0);
  });
});
