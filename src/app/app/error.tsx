"use client";

// Route-level error boundary for the product surface (/app, /app/login, and
// everything nested below). Next.js renders this in place of the crashing
// segment when a client-side render throws, so a thrown error shows a
// readable, recoverable screen instead of a dead/blank page. It does NOT
// catch errors thrown by this segment's own layout.tsx (those bubble up to
// global-error.tsx) — hence ClientShell also degrades on its own.

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/Wordmark";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the real error to the browser console / error tracking so the
    // readable UI below doesn't hide what actually broke.
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm text-center">
        <Wordmark
          variant="stacked"
          className="mx-auto mb-6"
          style={{ fontSize: "22px" }}
        />
        <h1 className="font-display text-lg font-semibold mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          This page hit an unexpected error. Try again — if it keeps happening,
          reload the page or come back in a moment.
        </p>
        <Button onClick={reset} className="w-full h-11">
          Try again
        </Button>
        {error.digest && (
          <p className="text-xs text-muted-foreground mt-4">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
