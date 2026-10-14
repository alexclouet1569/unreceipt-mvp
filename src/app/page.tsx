import { isPilotMode } from "@/lib/pilot";
import { LandingPage } from "./_landing";

// PILOT_MODE is read server-side here and passed down so the client
// component renders the right CTA copy. Forces dynamic so the toggle
// flips with one redeploy without invalidating a static cache.
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Preview toggle between the two scroll-receipt designs.
  const { receipt } = await searchParams;
  return (
    <LandingPage
      pilotMode={isPilotMode()}
      receipt={receipt === "paper" ? "paper" : "ribbon"}
    />
  );
}
