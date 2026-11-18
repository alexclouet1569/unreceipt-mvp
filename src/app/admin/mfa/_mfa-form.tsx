"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseClient } from "@/lib/supabase-client";

type Step =
  | { kind: "loading" }
  | { kind: "enroll"; factorId: string; qrCode: string; secret: string }
  | { kind: "verify"; factorId: string }
  | { kind: "error"; message: string };

/**
 * Sets up a TOTP authenticator (first time) or asks for its code, then
 * reloads /admin with the session raised to `aal2`. Uses Supabase Auth MFA
 * in the browser; the server only reads the resulting claims.
 */
export function AdminMfaForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mfa = getSupabaseClient().auth.mfa;
      const { data, error } = await mfa.listFactors();
      if (cancelled) return;
      if (error) return setStep({ kind: "error", message: "Couldn't read your sign-in methods. Reload the page." });

      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) return setStep({ kind: "verify", factorId: verified.id });

      // A set-up that was never finished (page closed before the code) is
      // removed first: Supabase refuses a second factor with the same name.
      for (const f of data.all) {
        if (f.factor_type === "totp" && f.status === "unverified") await mfa.unenroll({ factorId: f.id });
      }
      const enrolled = await mfa.enroll({ factorType: "totp", friendlyName: "UnReceipt admin" });
      if (cancelled) return;
      if (enrolled.error || !enrolled.data) {
        return setStep({ kind: "error", message: "Couldn't start the set-up. Reload the page." });
      }
      setStep({
        kind: "enroll",
        factorId: enrolled.data.id,
        qrCode: enrolled.data.totp.qr_code,
        secret: enrolled.data.totp.secret,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== "enroll" && step.kind !== "verify") return;
    setBusy(true);
    setError(null);
    const { error } = await getSupabaseClient().auth.mfa.challengeAndVerify({
      factorId: step.factorId,
      code: code.trim(),
    });
    if (error) {
      setBusy(false);
      setError("That code didn't work. Check the time on your phone and try the next code.");
      return;
    }
    // The raised session is in the auth cookie now; the server reads it on
    // the next request.
    router.replace("/admin");
    router.refresh();
  }

  if (step.kind === "loading") return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (step.kind === "error") return <p className="text-sm text-destructive">{step.message}</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      {step.kind === "enroll" && (
        <div className="space-y-2">
          <p className="text-sm">1. Scan this code with your authenticator app.</p>
          {/* Supabase returns the QR code as an SVG data URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={step.qrCode} alt="QR code for your authenticator app" width={180} height={180} className="border border-border rounded-md bg-white p-2" />
          <p className="text-xs text-muted-foreground">
            Can&apos;t scan? Type this key: <span className="font-mono break-all">{step.secret}</span>
          </p>
          <p className="text-sm">2. Enter the 6-digit code it shows.</p>
        </div>
      )}
      {step.kind === "verify" && <p className="text-sm">Enter the 6-digit code from your authenticator app.</p>}
      <Input
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        aria-label="6-digit code"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy || code.length !== 6}>
        {busy ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
