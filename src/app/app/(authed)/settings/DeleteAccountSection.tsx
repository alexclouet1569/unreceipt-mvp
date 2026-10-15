"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseClient } from "@/lib/supabase-client";

const CONFIRM_WORD = "DELETE";

/**
 * Settings → Delete account (launch plan action 44, App Store 5.1.1(v)).
 * Two deliberate steps: confirm the receipts you must keep are downloaded,
 * then type DELETE. The server re-checks both and also wants a recent
 * sign-in; when it asks for one we sign out and send the user to log in.
 */
export function DeleteAccountSection({
  exportSlot,
}: {
  // The "download your data" control, rendered in step 1.
  exportSlot?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);

  const canDelete = downloaded && typed.trim() === CONFIRM_WORD && !busy;

  const reset = () => {
    setOpen(false);
    setDownloaded(false);
    setTyped("");
    setError(null);
    setNeedsReauth(false);
  };

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    setNeedsReauth(false);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: CONFIRM_WORD }),
      });
      if (res.ok) {
        // The session cookies were cleared by the server; a hard navigation
        // drops any client state too.
        // Full page load (absolute URL): drops all client state with the session.
        window.location.href = new URL("/app/login?account=deleted", window.location.origin).href;
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401 && body.error === "reauth_required") {
        setNeedsReauth(true);
      } else if (res.status === 429) {
        setError("Too many attempts. Wait an hour and try again.");
      } else {
        setError(
          body.error && body.error.length > 30
            ? body.error
            : "Couldn't delete your account. Please try again, or email support@unreceipt.com.",
        );
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    }
    setBusy(false);
  };

  const signInAgain = async () => {
    await getSupabaseClient().auth.signOut().catch(() => {});
    window.location.href = new URL("/app/login?reauth=1", window.location.origin).href;
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-center gap-2 bg-card text-[var(--negative)] hover:bg-[color-mix(in_srgb,var(--negative)_6%,transparent)] transition-colors"
        style={{
          border: "1px solid var(--hairline)",
          borderRadius: "10px",
          height: "48px",
          fontSize: "15px",
          fontWeight: 600,
        }}
      >
        <Trash2 className="w-4 h-4" />
        Delete account
      </button>
    );
  }

  return (
    <div
      className="bg-card space-y-4"
      style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}
      role="region"
      aria-labelledby="delete-account-heading"
    >
      <div className="space-y-2">
        <h3
          id="delete-account-heading"
          className="font-display font-bold text-[var(--ink)]"
          style={{ fontSize: "16px" }}
        >
          Delete your account
        </h3>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
          This permanently deletes your account, every receipt and every
          original file we store. It can&apos;t be undone. Any subscription is
          cancelled straight away.
        </p>
      </div>

      <div className="space-y-2">
        <p
          className="uppercase text-[var(--ink-faint)]"
          style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em" }}
        >
          1 · Download your data first
        </p>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
          Swedish bookkeeping law requires your company to keep its receipts
          for seven years. Once your account is deleted we can&apos;t send
          you a copy.
        </p>
        {exportSlot}
        <label className="flex items-start gap-3 cursor-pointer" style={{ minHeight: "44px" }}>
          <input
            type="checkbox"
            checked={downloaded}
            onChange={(e) => setDownloaded(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]"
          />
          <span className="text-[var(--ink)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
            I&apos;ve downloaded the receipts I need to keep.
          </span>
        </label>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="delete-account-confirm"
          className="block uppercase text-[var(--ink-faint)]"
          style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em" }}
        >
          2 · Type {CONFIRM_WORD} to confirm
        </label>
        <Input
          id="delete-account-confirm"
          className="h-11"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
      </div>

      {needsReauth ? (
        <div
          role="alert"
          className="space-y-2 rounded-md px-3 py-2"
          style={{ background: "var(--attention-tint)" }}
        >
          <p className="text-[var(--attention-deep)]" style={{ fontSize: "14px" }}>
            For your security, sign in again before deleting your account.
            Then come back to Settings.
          </p>
          <Button type="button" variant="outline" className="h-11" onClick={signInAgain}>
            Sign in again
          </Button>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2"
        >
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-11"
          onClick={reset}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1 h-11 gap-1.5 bg-destructive text-white hover:bg-destructive/90"
          onClick={handleDelete}
          disabled={!canDelete}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {busy ? "Deleting…" : "Delete account"}
        </Button>
      </div>
    </div>
  );
}
