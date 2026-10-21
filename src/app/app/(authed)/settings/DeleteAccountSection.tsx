"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseClient } from "@/lib/supabase-client";
import { useI18n } from "@/lib/i18n/client";

// What the server checks. The person types the word in their own language
// (t.confirmWord); the request always carries this one.
const CONFIRM_WORD = "DELETE";

/**
 * Settings → Delete account (launch plan action 44, App Store 5.1.1(v)).
 * Two deliberate steps: confirm the receipts you must keep are downloaded,
 * then type DELETE (SUPPRIMER, RADERA). The server re-checks both and also wants a recent
 * sign-in; when it asks for one we sign out and send the user to log in.
 */
export function DeleteAccountSection({
  exportSlot,
}: {
  // The "download your data" control, rendered in step 1.
  exportSlot?: React.ReactNode;
}) {
  const { t: messages } = useI18n();
  const t = messages.settings.deleteAccount;
  const [open, setOpen] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);

  // Opening replaces the trigger with the panel (and Cancel does the
  // reverse); keep focus where the user is instead of dropping to <body>.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) headingRef.current?.focus();
    else if (wasOpen.current) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const canDelete = downloaded && typed.trim().toUpperCase() === t.confirmWord && !busy;

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
        setError(t.tooManyAttempts);
      } else {
        setError(body.error && body.error.length > 30 ? body.error : t.failed);
      }
    } catch {
      setError(messages.common.networkError);
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
        ref={triggerRef}
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
        {t.open}
      </button>
    );
  }

  return (
    <div
      className="bg-card space-y-4"
      style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
      role="region"
      aria-labelledby="delete-account-heading"
    >
      <div className="space-y-2">
        <h3
          id="delete-account-heading"
          ref={headingRef}
          tabIndex={-1}
          className="font-display font-bold text-[var(--ink)] outline-none"
          style={{ fontSize: "16px" }}
        >
          {t.heading}
        </h3>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
          {t.warning}
        </p>
      </div>

      <div className="space-y-2">
        <p
          className="uppercase text-[var(--ink-faint)]"
          style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em" }}
        >
          {t.step1}
        </p>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
          {t.keepRule}
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
            {t.downloaded}
          </span>
        </label>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="delete-account-confirm"
          className="block uppercase text-[var(--ink-faint)]"
          style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em" }}
        >
          {t.step2(t.confirmWord)}
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
            {t.reauth}
          </p>
          <Button type="button" variant="outline" className="h-11" onClick={signInAgain}>
            {t.signInAgain}
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
          {messages.common.cancel}
        </Button>
        <Button
          type="button"
          className="flex-1 h-11 gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          onClick={handleDelete}
          disabled={!canDelete}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {busy ? t.deleting : t.open}
        </Button>
      </div>
    </div>
  );
}
