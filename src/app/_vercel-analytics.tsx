"use client";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { scrubAnalyticsEvent } from "@/lib/tracking/scrub";
import { skipOptedOut } from "@/lib/tracking/opt-out";

// Vercel Web Analytics and Speed Insights with every URL scrubbed first
// (src/lib/tracking/scrub.ts): the product host's URLs can carry invite
// tokens and join codes. A client component because `beforeSend` is a
// function, which a server layout can't pass down.
//
// Visits from a browser that opened a page with ?analytics=off aren't sent
// (src/lib/tracking/opt-out.ts). Speed Insights still is: it measures how
// fast pages load, not who visits.
function analyticsBeforeSend<E extends { url: string }>(event: E): E | null {
  const kept = skipOptedOut(event);
  return kept ? scrubAnalyticsEvent(kept) : null;
}

export function VercelAnalytics() {
  return (
    <>
      <Analytics beforeSend={analyticsBeforeSend} />
      <SpeedInsights beforeSend={scrubAnalyticsEvent} />
    </>
  );
}
