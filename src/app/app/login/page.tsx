"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Receipt,
  Mail,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase-client";

// useSearchParams() forces a CSR bailout; Next 16 requires it to live
// inside a Suspense boundary so the page can still be statically
// prerendered. Without the wrapper the build aborts on /app/login.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

const signUpSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required").max(100),
  company_name: z.string().trim().max(100).optional().or(z.literal("")),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long"),
});

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

function LoginPageInner() {
  const searchParams = useSearchParams();
  const [topError, setTopError] = useState("");

  useEffect(() => {
    const callbackError = searchParams.get("error");
    if (callbackError) {
      setTopError(
        "That sign-in link didn't work. Magic links expire after one click and after one hour — request a new one below."
      );
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-3">
            <Receipt className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold">UnReceipt</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to manage your receipts
          </p>
        </div>

        {topError && (
          <p
            role="alert"
            className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 mb-4"
          >
            {topError}
          </p>
        )}

        <Card>
          <CardContent className="py-6 px-5 sm:px-6">
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-5 h-11">
                <TabsTrigger value="signin" className="h-9 text-sm">
                  Sign in
                </TabsTrigger>
                <TabsTrigger value="signup" className="h-9 text-sm">
                  Sign up
                </TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <SignInPanel />
              </TabsContent>
              <TabsContent value="signup">
                <SignUpPanel />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to homepage
          </Link>
        </div>
      </div>
    </div>
  );
}

function SignInPanel() {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your details");
      return;
    }

    setLoading(true);
    const { error: authError } = await getSupabaseClient().auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoading(false);

    if (authError) {
      setError("Email or password is wrong, try again.");
      return;
    }

    // signInWithPassword sets the session client-side via cookies — a hard
    // navigation to /app lets the server gate read the cookie on the next
    // request. router.push wouldn't trigger a server-side fetch.
    window.location.assign("/app");
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const parsed = z
      .object({ email: signInSchema.shape.email })
      .safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email");
      return;
    }

    setLoading(true);
    const { error: authError } = await getSupabaseClient().auth.signInWithOtp({
      email: parsed.data.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/app`,
      },
    });
    setLoading(false);

    if (authError) {
      setError("Something went wrong. Please try again.");
      return;
    }
    setMagicSent(true);
  };

  if (magicSent) {
    return (
      <div className="text-center py-2">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-6 h-6 text-primary" />
        </div>
        <h2 className="font-semibold text-base mb-2">Check your email</h2>
        <p className="text-sm text-muted-foreground mb-3">
          We sent a login link to{" "}
          <span className="font-medium text-foreground">{email}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Click the link to sign in. It expires in 1 hour.
        </p>
        <Button
          variant="ghost"
          className="mt-3 text-sm"
          onClick={() => {
            setMagicSent(false);
            setMode("password");
          }}
        >
          Use a different method
        </Button>
      </div>
    );
  }

  if (mode === "magic") {
    return (
      <form onSubmit={handleMagicLink} className="space-y-4">
        <div>
          <label
            htmlFor="signin-magic-email"
            className="text-sm font-medium block mb-1.5"
          >
            Email address
          </label>
          <Input
            id="signin-magic-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="h-11"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="w-full gap-2 h-11"
          disabled={loading}
        >
          <Mail className="w-4 h-4" />
          {loading ? "Sending..." : "Send Magic Link"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setMode("password");
            setError("");
          }}
          className="text-xs text-muted-foreground hover:text-foreground block mx-auto"
        >
          Back to password sign-in
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handlePasswordSignIn} className="space-y-4">
      <div>
        <label
          htmlFor="signin-email"
          className="text-sm font-medium block mb-1.5"
        >
          Email address
        </label>
        <Input
          id="signin-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          className="h-11"
        />
      </div>
      <div>
        <label
          htmlFor="signin-password"
          className="text-sm font-medium block mb-1.5"
        >
          Password
        </label>
        <div className="relative">
          <Input
            id="signin-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full h-11" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </Button>
      <button
        type="button"
        onClick={() => {
          setMode("magic");
          setError("");
        }}
        className="text-xs text-muted-foreground hover:text-foreground block mx-auto"
      >
        Forgot password? Email me a magic link
      </button>
    </form>
  );
}

function SignUpPanel() {
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const parsed = signUpSchema.safeParse({
      full_name: fullName,
      company_name: companyName,
      email,
      password,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your details");
      return;
    }

    setLoading(true);
    const { error: authError } = await getSupabaseClient().auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        // Land on /auth/callback so the session cookie is set server-side
        // and public.profiles is upserted from this metadata.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/app`,
        data: {
          full_name: parsed.data.full_name,
          company_name: parsed.data.company_name || null,
        },
      },
    });
    setLoading(false);

    if (authError) {
      const msg = (authError.message ?? "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered")) {
        setError(
          "That email is already registered. Try signing in, or use 'Forgot password?' to get a magic link."
        );
      } else if (msg.includes("password")) {
        setError("Password too weak — try at least 8 characters.");
      } else {
        setError("Couldn't create your account. Try again in a moment.");
      }
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="text-center py-2">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-6 h-6 text-primary" />
        </div>
        <h2 className="font-semibold text-base mb-2">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to{" "}
          <span className="font-medium text-foreground">{email}</span>. Click
          it to finish signup.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSignUp} className="space-y-4">
      <div>
        <label
          htmlFor="signup-name"
          className="text-sm font-medium block mb-1.5"
        >
          Full name
        </label>
        <Input
          id="signup-name"
          type="text"
          autoComplete="name"
          autoCapitalize="words"
          placeholder="Alex Andersson"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="h-11"
        />
      </div>
      <div>
        <label
          htmlFor="signup-company"
          className="text-sm font-medium block mb-1.5"
        >
          Company <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <Input
          id="signup-company"
          type="text"
          autoComplete="organization"
          placeholder="Acme AB"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          className="h-11"
        />
      </div>
      <div>
        <label
          htmlFor="signup-email"
          className="text-sm font-medium block mb-1.5"
        >
          Email address
        </label>
        <Input
          id="signup-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="h-11"
        />
      </div>
      <div>
        <label
          htmlFor="signup-password"
          className="text-sm font-medium block mb-1.5"
        >
          Password{" "}
          <span className="text-muted-foreground font-normal">(8+ chars)</span>
        </label>
        <div className="relative">
          <Input
            id="signup-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full h-11" disabled={loading}>
        {loading ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
