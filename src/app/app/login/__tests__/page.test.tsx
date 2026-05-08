import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn<
    (creds: { email: string; password: string }) => Promise<{ error: unknown }>
  >(),
  signInWithOtp: vi.fn(),
  signUp: vi.fn(),
  searchParams: new URLSearchParams(""),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/lib/supabase-client", () => ({
  getSupabaseClient: () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signInWithOtp: mocks.signInWithOtp,
      signUp: mocks.signUp,
    },
  }),
}));

import LoginPage from "@/app/app/login/page";

const originalLocation = window.location;

beforeEach(() => {
  mocks.signInWithPassword.mockReset();
  mocks.signInWithOtp.mockReset();
  mocks.signUp.mockReset();
  // window.location.assign isn't writable by default in jsdom — replace it.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, assign: vi.fn(), origin: "http://localhost:3000" },
  });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("/app/login — Tabs UI", () => {
  it("renders both Sign in and Sign up tabs", () => {
    render(<LoginPage />);
    expect(screen.getByRole("tab", { name: /Sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Sign up/i })).toBeInTheDocument();
  });

  it("defaults to the Sign in tab with email + password fields", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/Email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Sign in$/i })).toBeInTheDocument();
  });
});

describe("/app/login — Sign in flow", () => {
  it("calls signInWithPassword with the right shape on submit", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/Email address/i), "Alex@Example.SE");
    await user.type(screen.getByLabelText(/^Password$/i), "supersecret");
    await user.click(screen.getByRole("button", { name: /^Sign in$/i }));

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "alex@example.se",
      password: "supersecret",
    });
  });

  it("shows an inline error on bad credentials", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/Email address/i), "alex@example.se");
    await user.type(screen.getByLabelText(/^Password$/i), "wrong");
    await user.click(screen.getByRole("button", { name: /^Sign in$/i }));

    expect(
      await screen.findByText(/Email or password is wrong/i)
    ).toBeInTheDocument();
  });

  it("swaps to the magic-link form when 'Forgot password?' is clicked", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByText(/Forgot password\?/i));
    expect(
      screen.getByRole("button", { name: /Send Magic Link/i })
    ).toBeInTheDocument();
  });
});

describe("/app/login — Sign up flow", () => {
  const switchToSignUp = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("tab", { name: /Sign up/i }));
  };

  it("rejects empty full name", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await switchToSignUp(user);

    // Skip required HTML5 validation by submitting via the form's button
    // after typing only the password — full_name is blank.
    await user.type(screen.getByLabelText(/Email address/i), "alex@example.se");
    await user.type(screen.getByLabelText(/^Password/i), "supersecret");

    // Use form.submit-equivalent — bypasses required attr to prove zod catches it
    const form = screen.getByRole("button", { name: /Create account/i }).closest("form");
    expect(form).not.toBeNull();

    // Remove `required` so we can reach the zod path
    form!.querySelectorAll<HTMLInputElement>("input[required]").forEach((i) => {
      i.removeAttribute("required");
    });
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    expect(
      await screen.findByText(/Full name is required/i)
    ).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("rejects a weak password (<8 chars)", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await switchToSignUp(user);

    await user.type(screen.getByLabelText(/Full name/i), "Alex Andersson");
    await user.type(screen.getByLabelText(/Email address/i), "alex@example.se");
    await user.type(screen.getByLabelText(/^Password/i), "short");

    const form = screen.getByRole("button", { name: /Create account/i }).closest("form");
    form!.querySelectorAll<HTMLInputElement>("input[minlength]").forEach((i) => {
      i.removeAttribute("minlength");
    });
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    expect(
      await screen.findByText(/Password must be at least 8/i)
    ).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("calls signUp with metadata on valid submit and shows confirmation message", async () => {
    mocks.signUp.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<LoginPage />);
    await switchToSignUp(user);

    await user.type(screen.getByLabelText(/Full name/i), "Alex Andersson");
    await user.type(screen.getByLabelText(/Company/i), "Acme AB");
    await user.type(screen.getByLabelText(/Email address/i), "alex@example.se");
    await user.type(screen.getByLabelText(/^Password/i), "supersecret");
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "alex@example.se",
      password: "supersecret",
      options: {
        emailRedirectTo: "http://localhost:3000/auth/callback?next=/app",
        data: {
          full_name: "Alex Andersson",
          company_name: "Acme AB",
        },
      },
    });

    expect(
      await screen.findByText(/Check your email/i)
    ).toBeInTheDocument();
  });
});
