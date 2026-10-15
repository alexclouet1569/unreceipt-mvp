import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn<
    (creds: { email: string; password: string }) => Promise<{ error: unknown }>
  >(),
  signInWithOtp: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
}));

vi.mock("@/lib/supabase-client", () => ({
  getSupabaseClient: () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signInWithOtp: mocks.signInWithOtp,
      signUp: mocks.signUp,
      resend: mocks.resend,
    },
  }),
}));

import { AuthCard, type AuthMode } from "@/app/app/login/_auth-card";

const originalLocation = window.location;

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
  mocks.signInWithPassword.mockReset();
  mocks.signInWithOtp.mockReset();
  mocks.signUp.mockReset();
  mocks.resend.mockReset();
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
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("/app/login — modes", () => {
  it("defaults to Sign in with email + password fields", () => {
    renderCard();
    expect(screen.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Sign in$/i })).toBeInTheDocument();
  });

  it("opens on Create account when linked with ?mode=signup", () => {
    renderCard({ initialMode: "signup", pilot: true });
    expect(screen.getByRole("tab", { name: "Create account" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Join the pilot" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Full name/i)).toBeInTheDocument();
  });

  it("keeps the typed email when switching modes", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.type(screen.getByLabelText(/Email address/i), "alex@example.se");
    await user.click(screen.getByRole("tab", { name: "Create account" }));
    expect(screen.getByLabelText(/Work email/i)).toHaveValue("alex@example.se");
  });

  it("explains a broken email link", () => {
    renderCard({ linkError: true });
    expect(screen.getByRole("alert")).toHaveTextContent(/link didn.t work/i);
  });
});

describe("/app/login — Sign in flow", () => {
  it("calls signInWithPassword with the right shape and goes to /app", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderCard();

    await user.type(screen.getByLabelText(/Email address/i), "Alex@Example.SE");
    await user.type(screen.getByLabelText(/^Password$/i), "supersecret");
    await user.click(screen.getByRole("button", { name: /^Sign in$/i }));

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "alex@example.se",
      password: "supersecret",
    });
    expect(window.location.assign).toHaveBeenCalledWith("/app");
  });

  it("shows an inline error on bad credentials", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    });
    const user = userEvent.setup();
    renderCard();

    await user.type(screen.getByLabelText(/Email address/i), "alex@example.se");
    await user.type(screen.getByLabelText(/^Password$/i), "wrong");
    await user.click(screen.getByRole("button", { name: /^Sign in$/i }));

    expect(await screen.findByText(/Email or password is wrong/i)).toBeInTheDocument();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("tells an unconfirmed user to open the confirmation email", async () => {
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

  it("sends a magic link from 'Forgot password?'", async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByText(/Forgot password\?/i));
    await user.type(screen.getByLabelText(/Email address/i), "alex@example.se");
    await user.click(screen.getByRole("button", { name: /Email me a sign-in link/i }));

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "alex@example.se",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback?next=/app" },
    });
    expect(await screen.findByText(/Check your email/i)).toBeInTheDocument();
  });
});

describe("/app/login — Create account flow", () => {
  it("rejects an empty full name", async () => {
    const user = userEvent.setup();
    renderCard({ initialMode: "signup" });

    await user.type(screen.getByLabelText(/Work email/i), "alex@example.se");
    await user.type(screen.getByLabelText(/^Password/i), "supersecret");
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    expect(await screen.findByText(/Full name is required/i)).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("rejects a weak password (<8 chars)", async () => {
    const user = userEvent.setup();
    renderCard({ initialMode: "signup" });

    await user.type(screen.getByLabelText(/Full name/i), "Alex Andersson");
    await user.type(screen.getByLabelText(/Work email/i), "alex@example.se");
    await user.type(screen.getByLabelText(/^Password/i), "short");
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    expect(await screen.findByText(/Password must be at least 8/i)).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("calls signUp with metadata, confirms, and can resend", async () => {
    mocks.signUp.mockResolvedValue({ error: null });
    mocks.resend.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderCard({ initialMode: "signup" });

    await user.type(screen.getByLabelText(/Full name/i), "Alex Andersson");
    await user.type(screen.getByLabelText(/Company/i), "Acme AB");
    await user.type(screen.getByLabelText(/Work email/i), "alex@example.se");
    await user.type(screen.getByLabelText(/^Password/i), "supersecret");
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "alex@example.se",
      password: "supersecret",
      options: {
        emailRedirectTo: "http://localhost:3000/auth/callback?next=/app",
        data: { full_name: "Alex Andersson", company_name: "Acme AB" },
      },
    });
    expect(await screen.findByText(/Confirm your email/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Resend the email/i }));
    expect(mocks.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "alex@example.se",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback?next=/app" },
    });
    expect(await screen.findByText(/Sent again/i)).toBeInTheDocument();
  });

  it("offers sign-in when the email is already registered", async () => {
    mocks.signUp.mockResolvedValue({ error: { message: "User already registered" } });
    const user = userEvent.setup();
    renderCard({ initialMode: "signup" });

    await user.type(screen.getByLabelText(/Full name/i), "Alex Andersson");
    await user.type(screen.getByLabelText(/Work email/i), "alex@example.se");
    await user.type(screen.getByLabelText(/^Password/i), "supersecret");
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    await user.click(await screen.findByRole("button", { name: /Sign in instead/i }));
    expect(screen.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText(/Email address/i)).toHaveValue("alex@example.se");
  });
});
