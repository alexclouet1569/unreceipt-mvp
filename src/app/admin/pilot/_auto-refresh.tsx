"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Re-reads the page every 30 s while the tab is visible, so the founder
// watches the pilot happen without reloading.
export const REFRESH_MS = 30_000;

export function AutoRefresh({ renderedAt }: { renderedAt: string }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [on, router]);
  return (
    <p className="text-xs text-muted-foreground">
      Updated {new Date(renderedAt).toLocaleTimeString("sv-SE")}
      {" · "}
      <button type="button" className="underline" onClick={() => setOn((v) => !v)}>
        {on ? "Pause live updates" : "Resume live updates"}
      </button>
    </p>
  );
}
