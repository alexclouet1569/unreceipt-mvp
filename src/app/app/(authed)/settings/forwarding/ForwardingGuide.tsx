"use client";

import { IntakeRow } from "@/components/IntakeRow";
import { ForwardingWizard } from "./ForwardingWizard";

/**
 * The forwarding address page: what the address does, the step-by-step
 * setup wizard for automatic forwarding, the user's own addresses (for the
 * receipt ownership check) and forwarding by hand.
 */
export function ForwardingGuide({
  forwardingEmail,
  ownAddresses,
}: {
  forwardingEmail: string;
  // The "Your email addresses" manager, rendered by the server page.
  ownAddresses?: React.ReactNode;
}) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="what-heading">
        <SectionLabel id="what-heading">What this address does</SectionLabel>
        <div className="space-y-3">
          <IntakeRow
            callout="Your private receipts address"
            value={forwardingEmail}
            mono
            copyLabel="Copy forwarding address"
            quiet
          />
          <ul
            role="list"
            className="bg-card divide-y divide-[var(--hairline)]"
            style={{ border: "1px solid var(--hairline)", borderRadius: "12px" }}
          >
            <Fact title="Emails become receipts">
              Anything sent to this address shows up in UnReceipt within a
              minute. We read the shop, date, total and VAT, and keep the
              original email as proof.
            </Fact>
            <Fact title="You choose what we see">
              We only get the emails you forward. UnReceipt never signs in to
              or reads your inbox.
            </Fact>
            <Fact title="Not a receipt? It waits for you">
              Emails we can&apos;t read as a receipt wait under Review needed.
              They only count toward your plan if you keep them.
            </Fact>
            <Fact title="Keep it private">
              Anyone who has this address can send mail into your account.
              Don&apos;t post it publicly.
            </Fact>
          </ul>
        </div>
      </section>

      <section aria-labelledby="auto-heading">
        <SectionLabel id="auto-heading">Make it automatic</SectionLabel>
        <p
          className="text-[var(--ink-muted)]"
          style={{ fontSize: "14px", lineHeight: 1.5, marginBottom: "12px" }}
        >
          Set a rule once and your email forwards receipts by itself. The rule
          only forwards emails whose subject looks like a receipt, never your
          other mail.
        </p>
        <ForwardingWizard forwardingEmail={forwardingEmail} />
      </section>

      {ownAddresses ? (
        <section aria-labelledby="own-heading">
          <SectionLabel id="own-heading">Your email addresses</SectionLabel>
          {ownAddresses}
        </section>
      ) : null}

      <section aria-labelledby="hand-heading">
        <SectionLabel id="hand-heading">Forward by hand</SectionLabel>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
          Works from any email app, on any phone: open the receipt email, tap
          Forward and send it to your address. Save the address as a contact
          called &ldquo;UnReceipt&rdquo; so it&apos;s two taps next time.
          Forwarded by hand, a receipt waits under Review needed for a quick
          check.
        </p>
      </section>
    </div>
  );
}

function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li style={{ padding: "12px 14px" }}>
      <p className="text-[var(--ink)]" style={{ fontSize: "15px", fontWeight: 600, marginBottom: "2px" }}>
        {title}
      </p>
      <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
        {children}
      </p>
    </li>
  );
}

function SectionLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="uppercase text-[var(--ink-faint)] scroll-mt-16"
      style={{
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.06em",
        marginBottom: "8px",
      }}
    >
      {children}
    </h2>
  );
}
