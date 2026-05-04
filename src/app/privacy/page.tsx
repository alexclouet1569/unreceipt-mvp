import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy & data — UnReceipt",
  description:
    "How UnReceipt collects, processes, and stores your data — and your rights under GDPR.",
};

const LAST_UPDATED = "2026-05-05";
const SUPPORT_EMAIL = "support@unreceipt.com";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#ECF7E7]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[#303568]/70 hover:text-[#303568] mb-8"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to homepage
        </Link>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#303568] mb-3">
          Privacy &amp; data
        </h1>
        <p className="text-sm text-[#303568]/60 mb-10">
          Last updated {LAST_UPDATED}. Plain language; the exact contractual
          version available on request.
        </p>

        <Section title="Who we are">
          UnReceipt is operated from Sweden. The data controller for personal
          data processed through this product is the company behind{" "}
          <span className="font-medium">unreceipt.com</span>. For any
          privacy-related question, write to{" "}
          <Mailto>{SUPPORT_EMAIL}</Mailto>.
        </Section>

        <Section title="What we collect">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Account email.</strong> Used to send you sign-in magic
              links and product communications.
            </li>
            <li>
              <strong>Receipts you forward or upload.</strong> The image plus
              the structured fields we extract or you provide (merchant,
              amount, date, category, notes).
            </li>
            <li>
              <strong>Subscription status.</strong> Whether you&apos;re trialing,
              active, or canceled — synced from Stripe.
            </li>
            <li>
              <strong>Standard request metadata.</strong> IP, user agent, and
              timestamps captured by our hosting provider for security and
              abuse prevention.
            </li>
          </ul>
        </Section>

        <Section title="Why we process it">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>To deliver the service</strong> — we can&apos;t build a
              dashboard of your receipts without storing your receipts. Legal
              basis: contract performance.
            </li>
            <li>
              <strong>To bill you</strong> — Stripe handles the actual
              cardholder data; we only see the subscription state. Legal
              basis: contract performance.
            </li>
            <li>
              <strong>To prevent abuse and meet our security obligations</strong>{" "}
              — minimal request logs. Legal basis: legitimate interest.
            </li>
          </ul>
        </Section>

        <Section title="Who else processes your data (sub-processors)">
          <p className="mb-3">
            We use a small set of third parties under data processing
            agreements. They process your data only as needed to run UnReceipt
            and never for their own purposes.
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Supabase</strong> — database, authentication, file
              storage. Hosted in the EU.
            </li>
            <li>
              <strong>Stripe</strong> — subscription billing, payment
              processing, automatic VAT calculation.
            </li>
            <li>
              <strong>Vercel</strong> — application hosting, request routing,
              CDN.
            </li>
            <li>
              <strong>Resend</strong> — transactional email delivery (welcome
              emails, magic links).
            </li>
          </ul>
        </Section>

        <Section title="How long we keep it">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Active accounts:</strong> for as long as your subscription
              is active or you&apos;ve used the service in the last 12 months.
            </li>
            <li>
              <strong>After cancellation:</strong> 30 days for billing
              reconciliation, then your account and receipts are permanently
              deleted unless legal record-keeping requires longer (e.g.,
              Swedish bookkeeping law for invoiced amounts).
            </li>
            <li>
              <strong>Request immediate deletion at any time</strong> by
              emailing <Mailto>{SUPPORT_EMAIL}</Mailto> from your account
              email — we&apos;ll confirm within 30 days.
            </li>
          </ul>
        </Section>

        <Section title="Your rights">
          <p className="mb-3">
            Under GDPR you have the right to access, correct, export, restrict,
            object to processing of, or delete your personal data. To exercise
            any of these, email <Mailto>{SUPPORT_EMAIL}</Mailto> from your
            account email. We respond within 30 days.
          </p>
          <p>
            You can also lodge a complaint with the Swedish Authority for
            Privacy Protection (
            <a
              href="https://www.imy.se/en/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#27BE7B] underline underline-offset-2"
            >
              IMY
            </a>
            ) if you believe we&apos;re mishandling your data.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            We set a small number of strictly-necessary cookies to keep you
            signed in and to remember a couple of UI preferences. We do not
            use advertising or cross-site tracking cookies. Anonymous,
            aggregated traffic measurement is provided by Vercel Web Analytics
            and Speed Insights.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We&apos;ll update this page when our practices change, and email
            account holders for material changes. The version date at the top
            tells you when it was last revised.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            <Mailto>{SUPPORT_EMAIL}</Mailto> for anything about your data, this
            policy, or to raise a concern.
          </p>
        </Section>

        <div className="mt-12 pt-8 border-t border-[#303568]/10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-[#303568]/70 hover:text-[#303568]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to homepage
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-[#303568] mb-3">{title}</h2>
      <div className="text-sm text-[#303568]/80 leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  );
}

function Mailto({ children }: { children: string }) {
  return (
    <a
      href={`mailto:${children}`}
      className="text-[#27BE7B] font-medium hover:underline underline-offset-2"
    >
      {children}
    </a>
  );
}
