"use client";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { scrubAnalyticsEvent } from "@/lib/tracking/scrub";

// Vercel Web Analytics and Speed Insights with every URL scrubbed first
// (src/lib/tracking/scrub.ts): the product host's URLs can carry invite
// tokens and join codes. A client component because `beforeSend` is a
// function, which a server layout can't pass down.
export function VercelAnalytics() {
  return (
    <>
      <Analytics beforeSend={scrubAnalyticsEvent} />
      <SpeedInsights beforeSend={scrubAnalyticsEvent} />
    </>
  );
}
