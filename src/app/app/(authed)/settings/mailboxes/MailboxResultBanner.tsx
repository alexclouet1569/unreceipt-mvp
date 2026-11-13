"use client";

// The sentence shown on Settings after Google's or Microsoft's screen
// (/app/settings?mailbox=connected|error|cancelled&reason=…). Closing it
// takes the query off the address, so a reload doesn't show it again.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import {
  CANCELLED_MESSAGE,
  CONNECTED_MESSAGE,
  reasonMessage,
  type MailboxResult,
} from "./copy";

export function MailboxResultBanner({ result }: { result: MailboxResult }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  // Arriving back from the provider: bring the sentence into view.
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: "nearest" });
  }, []);

  if (!open) return null;

  const isError = result.kind === "error";
  const text =
    result.kind === "connected"
      ? CONNECTED_MESSAGE
      : result.kind === "cancelled"
        ? CANCELLED_MESSAGE
        : reasonMessage(result.reason);

  const close = () => {
    setOpen(false);
    router.replace("/app/settings", { scroll: false });
  };

  return (
    <div
      ref={ref}
      role={isError ? "alert" : "status"}
      data-testid="mailbox-result"
      className="flex items-start gap-2 rounded-[12px]"
      style={
        isError
          ? { background: "var(--attention-tint)", padding: "4px 4px 4px 14px" }
          : { background: "var(--card)", border: "1px solid var(--hairline)", padding: "4px 4px 4px 14px" }
      }
    >
      {result.kind === "connected" ? (
        <Check aria-hidden="true" className="mt-3 h-4 w-4 shrink-0 text-[var(--brand-action)]" />
      ) : null}
      <p
        className={`type-body flex-1 py-2.5 ${isError ? "text-[var(--attention-deep)]" : "text-[var(--ink)]"}`}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-[var(--ink-muted)] outline-none transition-colors duration-100 hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
