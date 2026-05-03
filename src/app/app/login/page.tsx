"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Receipt, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase-client";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // /auth/callback bounces here with ?error=… when the magic link is bad
  // (expired, already used, signature mismatch, missing code). Show it so
  // the user understands why they're back on /app/login instead of the
  // dashboard they were trying to reach.
  useEffect(() => {
    const callbackError = searchParams.get("error");
    if (callbackError) {
      setError(
        "That sign-in link didn't work. Magic links expire after one click and after one hour — request a new one below."
      );
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError("");

    const { error } = await getSupabaseClient().auth.signInWithOtp({
      email: email.toLowerCase().trim(),
      options: {
        // Route through /auth/callback so the session cookie gets set
        // server-side before /app's gate sees the request. Without this
        // hop, the cookie never gets written and /app bounces back here.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/app`,
      },
    });

    if (error) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-3">
            <Receipt className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold">UnReceipt</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to manage your receipts
          </p>
        </div>

        <Card>
          <CardContent className="py-6 px-6">
            {!sent ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="text-sm font-medium block mb-1.5"
                  >
                    Email address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  <Mail className="w-4 h-4" />
                  {loading ? "Sending..." : "Send Magic Link"}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  No password needed — we&apos;ll email you a login link
                </p>
              </form>
            ) : (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-6 h-6 text-primary" />
                </div>
                <h2 className="font-semibold text-lg mb-2">Check your email</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  We sent a login link to{" "}
                  <span className="font-medium text-foreground">{email}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Click the link in the email to sign in. It expires in 1 hour.
                </p>
                <Button
                  variant="ghost"
                  className="mt-4 text-sm"
                  onClick={() => {
                    setSent(false);
                    setEmail("");
                  }}
                >
                  Use a different email
                </Button>
              </div>
            )}
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
