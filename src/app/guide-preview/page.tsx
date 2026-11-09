import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ForwardingGuide } from "../app/(authed)/settings/forwarding/ForwardingGuide";

// TEMPORARY, for reviewing the forwarding guide on a Vercel preview without
// signing in. It shows the real guide with a sample address and no user
// data. 404 everywhere except preview deployments and local dev; delete
// this folder before the branch is merged.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Forwarding guide preview",
  robots: { index: false, follow: false },
};

export default function GuidePreviewPage() {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") notFound();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center">
          <h1 className="font-display font-bold text-[var(--ink)]" style={{ fontSize: "18px", letterSpacing: "-0.01em" }}>
            Your receipts address
          </h1>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", marginBottom: "16px" }}>
          Preview with a sample address. Gmail&apos;s code and the test email
          won&apos;t arrive here, and &ldquo;Email me this page&rdquo; won&apos;t send.
        </p>
        <ForwardingGuide forwardingEmail="receipts+abc12345mn@in.unreceipt.com" accountEmail={null} />
      </main>
    </div>
  );
}
