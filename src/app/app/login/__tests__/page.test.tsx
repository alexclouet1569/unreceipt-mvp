import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  verifyOtp: vi.fn(),
  getSession: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/supabase-client", () => ({
  getSupabaseClient: () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signInWithOtp: mocks.signInWithOtp,
      signUp: mocks.signUp,
      resend: mocks.resend,
      verifyOtp: mocks.verifyOtp,
      getSession: mocks.getSession,
    },
  }),
}));

import { AuthCard, type AuthMode } from "@/app/app/login/_auth-card";

const originalLocation = window.location;
const CALLBACK = "http://localhost:3000/auth/callback?next=/app";

const renderCard = (
  props: Partial<{ initialMode: AuthMode; pilot: boolean; linkError: boolean; notice: string | null }> = {}
) =>
  render(
    <AuthCard
      initialMode={props.initialMode ?? "signin"}
      pilot={props.pilot ?? false}
      linkError={props.linkError ?? false}
      notice={props.notice ?? null}
    />
  );

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.fetch.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", mocks.fetch);
  // window.location.assign isn't writable by default in jsdom — replace it.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...originalLocation,
      assign: vi.fn(),
      origin: "http://localhost:3000",
      href: "http://localhost:3000/app/login",
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

async function fillSignUp(user: ReturnType<typeof userEvent.setup>, opts: { name?: string; password?: string } = {}) {
  if (opts.name !== "") await user.type(screen.getByLabelText(/Full name/i), opts.name ?? "Alex Andersson");
  await user.type(screen.getByLabelText(/Work email/i), "alex@example.se");
  await user.type(screen.getByLabelText(/^Password/i), opts.password ?? "supersecret");
}

describe("/app/login — modes", () => {
  it("defaults to Sign in with email + password fields", () => {
    renderCard();
    expect(screen.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
  });

  it("opens on Create account when linked with ?mode=signup", () => {
    renderCard({ initialMode: "signup", pilot: true });
    expect(screen.getByRole("tab", { name: "Create account" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Join the pilot" })).toBeInTheDocument();
  });

  it("keeps the typed email when switching modes", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.type(screen.getByLabelText(/Email address/i), "alex@example.se");
    await user.click(screen.getByRole("tab", { name: "Create account" }));
    expect(screen.getByLabelText(/Work email/i)).toHaveValue("alex@example.se");
  });

  it("switches modes with the arrow keys and keeps one tab in the Tab order", async () => {
    const user = userEvent.setup();
    renderCard();
    const signIn = screen.getByRole("tab", { name: "Sign in" });
    const signUp = screen.getByRole("tab", { name: "Create account" });
    expect(signUp).toHaveAttribute("tabindex", "-1");
    signIn.focus();
    await user.keyboard("{ArrowRight}");
    expect(signUp).toHaveAttribute("aria-selected", "true");
    expect(signUp).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", signUp.id);
  });

  it("offers a fix for a mistyped email domain", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.type(screen.getByLabelText(/Email address/i), "alex@gmial.com");
    await user.tab();
    await user.click(screen.getByRole("button", { name: /Did you mean alex@gmail.com/i }));
    expect(screen.getByLabelText(/Email address/i)).toHaveValue("alex@gmail.com");
  });

  it("explains a broken email link", () => {
    renderCard({ linkError: true });
    expect(screen.getByRole("alert")).toHaveTextContent(/link didn.t work/i);
  });
});

describe("/app/login — password sign-in", () => {
  it("signs in and goes to /app", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderCard();

    await user.type(screen.getByLabelText(/Email address/i), "Alex@Example.SE");
    await user.type(screen.getByLabelText(/^Password$/i), "supersecret");
    await user.click(screen.getByRole("button", { name: /^Sign in$/i }));

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "alex@example.se", password: "supersecret" });
    expect(window.location.assign).toHaveBeenCalledWith("/app");
    expect(screen.getByRole("button", { name: /Signed in/i })).toBeDisabled();
  });

  it("points at the field when the email is invalid", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.type(screen.getByLabelText(/Email address/i), "alex");
    await user.type(screen.getByLabelText(/^Password$/i), "x");
    await user.click(screen.getByRole("button", { name: /^Sign in$/i }));

    const email = screen.getByLabelText(/Email address/i);
    expect(await screen.findByText(/Enter a valid email address/i)).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");
    await vi.waitFor(() => expect(email).toHaveFocus());
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("shows an inline error on bad credentials", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials", code: "invalid_credentials", status: 400 },
    });
    const user = userEvent.setup();
    renderCard();
    await user.type(screen.getByLabelText(/Email address/i), "alex@example.se");
    await user.type(screen.getByLabelText(/^Password$/i), "wrong");
    await user.click(screen.getByRole("button", { name: /^Sign in$/i }));

    expect(await screen.findByText(/Email or password is wrong/i)).toBeInTheDocument();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("tells an unconfirmed user to confirm first", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      error: { message: "Email not confirmed", code: "email_not_confirmed" },
    });
    const user = userEvent.setup();
    renderCard();
    await user.type(screen.getByLabelText(/Email address/i), "alex@example.se");
    await user.type(screen.getByLabelText(/^Password$/i), "supersecret");
    await user.click(screen.getByRole("button", { name: /^Sign in$/i }));
    expect(await screen.findByText(/Confirm your email first/i)).toBeInTheDocument();
  });

  it("says the service is unreachable on a network failure", async () => {
    mocks.signInWithPassword.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    renderCard();
    await user.type(screen.getByLabelText(/Email address/i), "alex@example.se");
    await user.type(screen.getByLabelText(/^Password$/i), "supersecret");
    await user.click(screen.getByRole("button", { name: /^Sign in$/i }));
    expect(await screen.findByText(/couldn.t reach the sign-in service/i)).toBeInTheDocument();
  });
});

describe("/app/login — email code", () => {
  it("signs in with a code: request, type 6 digits, finish, go to /app", async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    mocks.verifyOtp.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByText(/Forgot password\?/i));
    await user.type(screen.getByLabelText(/Email address/i), "alex@gmail.com");
    await user.click(screen.getByRole("button", { name: /Email me a code/i }));

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "alex@gmail.com",
      options: { emailRedirectTo: CALLBACK },
    });
    expect(await screen.findByRole("heading", { name: /Check your inbox/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Gmail/i })).toHaveAttribute("target", "_blank");

    await user.type(screen.getByLabelText(/6-digit code/i), "123456");

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: "alex@gmail.com", token: "123456", type: "email" });
    await vi.waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("/app"));
    expect(mocks.fetch).toHaveBeenCalledWith("/api/auth/finish", { method: "POST" });
  });

  it("clears the cells and explains a wrong code", async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    mocks.verifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid", code: "otp_expired" } });
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByText(/Forgot password\?/i));
    await user.type(screen.getByLabelText(/Email address/i), "alex@example.se");
    await user.click(screen.getByRole("button", { name: /Email me a code/i }));

    const code = await screen.findByLabelText(/6-digit code/i);
    await user.type(code, "999999");

    expect(await screen.findByText(/expired or was already used/i)).toBeInTheDocument();
    expect(code).toHaveValue("");
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("ignores letters in the code field", async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByText(/Forgot password\?/i));
    await user.type(screen.getByLabelText(/Email address/i), "alex@example.se");
    await user.click(screen.getByRole("button", { name: /Email me a code/i }));

    const code = await screen.findByLabelText(/6-digit code/i);
    await user.type(code, "12ab3");
    expect(code).toHaveValue("123");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("follows a link confirmed in another tab", async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByText(/Forgot password\?/i));
    await user.type(screen.getByLabelText(/Email address/i), "alex@example.se");
    await user.click(screen.getByRole("button", { name: /Email me a code/i }));
    await screen.findByLabelText(/6-digit code/i);

    mocks.getSession.mockResolvedValue({
      data: { session: { user: { email: "alex@example.se" } } },
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await vi.waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("/app"));
  });
});

describe("/app/login — create account", () => {
  it("rejects an empty full name and focuses it", async () => {
    const user = userEvent.setup();
    renderCard({ initialMode: "signup" });
    await fillSignUp(user, { name: "" });
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    const name = screen.getByLabelText(/Full name/i);
    expect(await screen.findByText(/Full name is required/i)).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    await vi.waitFor(() => expect(name).toHaveFocus());
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("rejects a weak password (<8 chars)", async () => {
    const user = userEvent.setup();
    renderCard({ initialMode: "signup" });
    await fillSignUp(user, { password: "short" });
    await user.click(screen.getByRole("button", { name: /Create account/i }));
    expect(await screen.findByText(/Password must be at least 8/i)).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("signs up with metadata, then confirms with the code", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    mocks.verifyOtp.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderCard({ initialMode: "signup" });

    await user.type(screen.getByLabelText(/Company/i), "Acme AB");
    await fillSignUp(user);
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "alex@example.se",
      password: "supersecret",
      options: {
        emailRedirectTo: CALLBACK,
        data: { full_name: "Alex Andersson", company_name: "Acme AB" },
      },
    });
    expect(await screen.findByRole("heading", { name: /Confirm your email/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/6-digit code/i), "654321");
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: "alex@example.se", token: "654321", type: "email" });
    await vi.waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("/app"));
  });

  it("goes straight in when the project doesn't require confirmation", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const user = userEvent.setup();
    renderCard({ initialMode: "signup" });
    await fillSignUp(user);
    await user.click(screen.getByRole("button", { name: /Create account/i }));
    await vi.waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("/app"));
  });

  it("lets the person change the email from the code step", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const user = userEvent.setup();
    renderCard({ initialMode: "signup" });
    await fillSignUp(user);
    await user.click(screen.getByRole("button", { name: /Create account/i }));
    await user.click(await screen.findByRole("button", { name: /Change email/i }));
    expect(screen.getByLabelText(/Work email/i)).toHaveValue("alex@example.se");
  });

  it("offers sign-in when the email is already registered", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: { message: "User already registered" } });
    const user = userEvent.setup();
    renderCard({ initialMode: "signup" });
    await fillSignUp(user);
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    await user.click(await screen.findByRole("button", { name: /Sign in instead/i }));
    expect(screen.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText(/Email address/i)).toHaveValue("alex@example.se");
  });
});
