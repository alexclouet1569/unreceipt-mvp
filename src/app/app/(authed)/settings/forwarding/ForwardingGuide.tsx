"use client";

import { IntakeRow } from "@/components/IntakeRow";
import { useI18n } from "@/lib/i18n/client";
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
  const { t: messages } = useI18n();
  const t = messages.settings.forwarding;
  return (
    <div className="space-y-8">
      <section aria-labelledby="what-heading">
        <SectionLabel id="what-heading">{t.whatHeading}</SectionLabel>
        <div className="space-y-3">
          <IntakeRow
            callout={t.privateAddress}
            value={forwardingEmail}
            mono
            copyLabel={messages.settings.page.copyForwarding}
            quiet
          />
          <ul
            role="list"
            className="bg-card divide-y divide-[var(--hairline)]"
            style={{ border: "1px solid var(--hairline)", borderRadius: "12px" }}
          >
            <Fact title={t.facts.becomeTitle}>{t.facts.becomeBody}</Fact>
            <Fact title={t.facts.chooseTitle}>{t.facts.chooseBody}</Fact>
            <Fact title={t.facts.waitsTitle}>{t.facts.waitsBody}</Fact>
            <Fact title={t.facts.privateTitle}>{t.facts.privateBody}</Fact>
          </ul>
        </div>
      </section>

      <section aria-labelledby="auto-heading">
        <SectionLabel id="auto-heading">{t.autoHeading}</SectionLabel>
        <p
          className="text-[var(--ink-muted)]"
          style={{ fontSize: "14px", lineHeight: 1.5, marginBottom: "12px" }}
        >
          {t.autoBody}
        </p>
        <ForwardingWizard forwardingEmail={forwardingEmail} />
      </section>

      {ownAddresses ? (
        <section aria-labelledby="own-heading">
          <SectionLabel id="own-heading">{t.ownHeading}</SectionLabel>
          {ownAddresses}
        </section>
      ) : null}

      <section aria-labelledby="hand-heading">
        <SectionLabel id="hand-heading">{t.handHeading}</SectionLabel>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
          {t.handBody}
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
