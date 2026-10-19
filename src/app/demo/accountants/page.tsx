import type { Metadata } from "next";
import { AccountantDemo } from "./_accountant-demo";

// The accounting-firm view, filled with sample clients, for showing to
// accounting firms in sales meetings. Unlike /demo it is served in
// production too (unlisted, noindex): it holds only made-up data, calls no
// API and stores nothing — the reconciliation runs in the browser — so a
// firm can open the link again after the meeting.

export const metadata: Metadata = {
  title: "For accounting firms",
  robots: { index: false, follow: false },
};

export default function AccountantDemoPage() {
  return <AccountantDemo />;
}
