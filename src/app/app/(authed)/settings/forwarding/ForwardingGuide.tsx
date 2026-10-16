"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IntakeRow } from "@/components/IntakeRow";
import {
  RECEIPT_SUBJECT_WORDS,
  gmailFilterQuery,
  outlookSubjectWords,
} from "@/lib/forwarding-filters";

export type GuideConfirmation = {
  code: string | null;
  forAddress: string | null;
  receivedAt: string;
};

type Provider = "gmail" | "outlook" | "other";

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "gmail", label: "Gmail" },
  { id: "outlook", label: "Outlook" },
  { id: "other", label: "Other" },
];

// While the Gmail steps are open, re-read the page so Gmail's code shows up
// without a reload: quickly while waiting, slowly once a code is shown (only
// a newer one can change it). Bounded so a forgotten tab stops asking.
const POLL_MS = 5_000;
const POLL_WITH_CODE_MS = 30_000;
const POLL_FOR_MS = 10 * 60 * 1000;

/**
 * What the forwarding address does, then a step-by-step forwarding rule
 * for the user's email provider. Gmail's confirmation code arrives through
 * /api/intake/email and is passed in by the server page.
 */
export function ForwardingGuide({
  forwardingEmail,
  confirmation,
  ownAddresses,
}: {
  forwardingEmail: string;
  confirmation: GuideConfirmation | null;
  // The "Your email addresses" manager, rendered by the server page.
  ownAddresses?: React.ReactNode;
}) {
  const [provider, setProvider] = useState<Provider>("gmail");
  const inboundDomain = forwardingEmail.split("@")[1] ?? forwardingEmail;

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

      <section aria-labelledby="hand-heading">
        <SectionLabel id="hand-heading">Forward by hand</SectionLabel>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
          Works from any email app, on any phone: open the receipt email, tap
          Forward and send it to your address. Save the address as a contact
          called &ldquo;UnReceipt&rdquo; so it&apos;s two taps next time.
        </p>
      </section>

      <section aria-labelledby="auto-heading">
        <SectionLabel id="auto-heading">Make it automatic</SectionLabel>
        <p
          className="text-[var(--ink-muted)]"
          style={{ fontSize: "14px", lineHeight: 1.5, marginBottom: "12px" }}
        >
          Set a rule once and your email forwards receipts by itself. It
          takes about 3 minutes and needs a computer. The rule only forwards
          emails whose subject looks like a receipt, not your other mail.
        </p>

        <div role="group" aria-label="Your email provider" className="flex gap-2" style={{ marginBottom: "16px" }}>
          {PROVIDERS.map((p) => (
            <ProviderButton
              key={p.id}
              active={provider === p.id}
              onClick={() => setProvider(p.id)}
              label={p.label}
            />
          ))}
        </div>

        {provider === "gmail" ? (
          <GmailSteps confirmation={confirmation} />
        ) : null}
        {provider === "outlook" ? <OutlookSteps inboundDomain={inboundDomain} /> : null}
        {provider === "other" ? <OtherSteps /> : null}
      </section>

      {ownAddresses ? (
        <section aria-labelledby="own-heading">
          <SectionLabel id="own-heading">Your email addresses</SectionLabel>
          {ownAddresses}
        </section>
      ) : null}

      <section aria-labelledby="test-heading">
        <SectionLabel id="test-heading">Check that it works</SectionLabel>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
          Ask a colleague, or use another email account, to send you an email
          with the subject <Strong>Test receipt</Strong>. Within a minute it
          should appear in UnReceipt under Review needed. Delete it
          afterwards; it doesn&apos;t count toward your plan. Nothing after 5
          minutes? Check your Spam folder and the rule, or write to{" "}
          <SupportLink />.
        </p>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5, marginTop: "8px" }}>
          A rule only forwards new emails. Forward older receipts by hand. Tip:
          apps such as Uber and Bolt let you choose where receipts are sent;
          enter your UnReceipt address in their business profile.
        </p>
      </section>
    </div>
  );
}

function GmailSteps({ confirmation }: { confirmation: GuideConfirmation | null }) {
  const router = useRouter();
  const hasCode = Boolean(confirmation?.code);

  useEffect(() => {
    const started = Date.now();
    const expired = () => Date.now() - started > POLL_FOR_MS;
    const timer = setInterval(() => {
      if (expired()) {
        clearInterval(timer);
        return;
      }
      if (document.visibilityState === "visible") router.refresh();
    }, hasCode ? POLL_WITH_CODE_MS : POLL_MS);
    // Coming back from the Gmail tab: check straight away.
    const onVisible = () => {
      if (!expired() && document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, hasCode]);

  return (
    <div className="space-y-4">
      <Note>
        Use Gmail in a browser on a computer; the Gmail app can&apos;t set up
        forwarding. Work Gmail (Google Workspace): if you can&apos;t add a
        forwarding address, your admin has turned forwarding off. Ask them to
        allow it.
      </Note>
      <Steps>
        <Step n={1}>
          In Gmail, click the gear, then <Strong>See all settings</Strong>, then
          the <Strong>Forwarding and POP/IMAP</Strong> tab.
        </Step>
        <Step n={2}>
          Click <Strong>Add a forwarding address</Strong>, paste your address
          from the top of this page, then <Strong>Next</Strong>,{" "}
          <Strong>Proceed</Strong> and <Strong>OK</Strong>. Gmail may ask you
          to sign in again first; that&apos;s normal.
        </Step>
        <Step n={3}>
          Gmail emails a confirmation code to your UnReceipt address, and it
          appears below within a minute. Type it into Gmail&apos;s{" "}
          <Strong>Confirmation code</Strong> box in the same Forwarding section
          and click <Strong>Verify</Strong>.
          <div style={{ marginTop: "8px" }}>
            <ConfirmationCode confirmation={confirmation} />
          </div>
        </Step>
        <Step n={4}>
          Leave <Strong>Disable forwarding</Strong> selected. Otherwise Gmail
          forwards all your mail, not just receipts. The next step forwards
          receipts only.
        </Step>
        <Step n={5}>
          Open the <Strong>Filters and Blocked Addresses</Strong> tab and click{" "}
          <Strong>Create a new filter</Strong>. Paste this into{" "}
          <Strong>Has the words</Strong>, then click{" "}
          <Strong>Create filter</Strong>.
          <div style={{ marginTop: "8px" }}>
            <IntakeRow
              callout="Has the words"
              value={gmailFilterQuery()}
              mono={false}
              copyLabel="Copy Gmail filter"
              breakWords
              quiet
            />
          </div>
        </Step>
        <Step n={6}>
          Tick <Strong>Forward it to</Strong>, choose your UnReceipt address,
          and click <Strong>Create filter</Strong>. Done. Address not in the
          list? Finish step 3 first. If this Gmail isn&apos;t your sign-in
          email, add it under <Strong>Your email addresses</Strong> below.
        </Step>
      </Steps>
    </div>
  );
}

function ConfirmationCode({ confirmation }: { confirmation: GuideConfirmation | null }) {
  // Relative time is computed after mount so server and client render the
  // same markup.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  const minutes =
    now == null || !confirmation
      ? null
      : Math.max(0, Math.round((now - Date.parse(confirmation.receivedAt)) / 60_000));
  const age =
    minutes == null ? "" : minutes < 1 ? "just now" : minutes < 120 ? `${minutes} min ago` : "earlier";

  // One live region that stays mounted, so the code arriving is announced;
  // the ticking age sits outside it so it isn't re-read every minute.
  return (
    <div>
      <div role="status">
        {!confirmation ? (
          <p
            className="bg-card text-[var(--ink-muted)]"
            style={{
              border: "1px dashed var(--hairline)",
              borderRadius: "12px",
              padding: "12px 14px",
              fontSize: "14px",
            }}
          >
            Waiting for Gmail&apos;s email… This page checks by itself.
          </p>
        ) : !confirmation.code ? (
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
            Gmail&apos;s email arrived, but we couldn&apos;t read the code in it.
            Write to <SupportLink /> and we&apos;ll send it to you.
          </p>
        ) : (
          <IntakeRow
            callout="Gmail's code"
            value={confirmation.code}
            mono={false}
            copyLabel="Copy Gmail confirmation code"
            quiet
          />
        )}
      </div>
      {confirmation?.code ? (
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "12px", marginTop: "6px" }}>
          {confirmation.forAddress ? `For ${confirmation.forAddress}. ` : ""}
          {age ? `Received ${age}. ` : ""}Added the address again? The newest
          code replaces this one here.
        </p>
      ) : null}
    </div>
  );
}

function SupportLink() {
  return (
    <a href="mailto:support@unreceipt.com" className="underline underline-offset-2 text-[var(--ink)]">
      support@unreceipt.com
    </a>
  );
}

function OutlookSteps({ inboundDomain }: { inboundDomain: string }) {
  return (
    <div className="space-y-4">
      <Note>
        Use Outlook in a browser: outlook.com for personal accounts,
        outlook.office.com for work. The Outlook app can&apos;t create
        forwarding rules.
      </Note>
      <Steps>
        <Step n={1}>
          Click the gear at the top right, then <Strong>Mail</Strong>,{" "}
          <Strong>Rules</Strong> and <Strong>+ Add new rule</Strong>. Name it
          UnReceipt.
        </Step>
        <Step n={2}>
          Under <Strong>Add a condition</Strong>, choose{" "}
          <Strong>Subject includes</Strong> and add these words one at a time,
          pressing Enter after each:
          <WordList words={outlookSubjectWords()} />
        </Step>
        <Step n={3}>
          Under <Strong>Add an action</Strong>, choose{" "}
          <Strong>Redirect to</Strong> (not &ldquo;Forward to&rdquo;: a
          redirect keeps the original sender, so we can verify the receipt)
          and paste your UnReceipt address.
        </Step>
        <Step n={4}>
          Click <Strong>Save</Strong>. If this Outlook address isn&apos;t your
          sign-in email, add it under <Strong>Your email addresses</Strong>{" "}
          below. Done.
        </Step>
      </Steps>
      <Note>
        Work accounts (Microsoft 365) block forwarding outside the company by
        default. If you get a bounce email saying your organisation
        doesn&apos;t allow external forwarding, ask your IT admin to allow
        automatic forwarding to {inboundDomain}.
      </Note>
    </div>
  );
}

function OtherSteps() {
  return (
    <div className="space-y-4">
      <Steps>
        <Step n={1}>
          Open your email on the web (iCloud, Yahoo, Proton and most others)
          and find <Strong>Rules</Strong> or <Strong>Filters</Strong> in the
          settings.
        </Step>
        <Step n={2}>
          Create a rule: when the subject contains one of these words, forward
          to your UnReceipt address. If only one word fits per rule, start
          with the words your receipts use most.
          <WordList words={RECEIPT_SUBJECT_WORDS} />
        </Step>
        <Step n={3}>
          If your provider asks you to confirm the address, its email shows up
          in UnReceipt under Review needed. Open it, tap{" "}
          <Strong>Original</Strong> to read the code, then delete it.
        </Step>
      </Steps>
      <Note>
        No rules in your email? Forward receipts by hand. It works from any
        app.
      </Note>
    </div>
  );
}

function WordList({ words }: { words: readonly string[] }) {
  return (
    <ul role="list" className="flex flex-wrap gap-2" style={{ marginTop: "8px" }} aria-label="Subject words">
      {words.map((w) => (
        <li
          key={w}
          className="text-[var(--ink)]"
          style={{
            border: "1px solid var(--hairline)",
            borderRadius: "6px",
            padding: "4px 8px",
            fontSize: "13px",
            fontWeight: 500,
          }}
        >
          {w}
        </li>
      ))}
    </ul>
  );
}

function ProviderButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="inline-flex items-center transition-colors"
      style={{
        minHeight: "44px",
        padding: "0 16px",
        borderRadius: "999px",
        fontSize: "14px",
        fontWeight: 600,
        border: active ? "1px solid var(--ink)" : "1px solid var(--hairline)",
        background: active ? "var(--ink)" : "transparent",
        color: active ? "var(--surface)" : "var(--ink-muted)",
      }}
    >
      {label}
    </button>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  // role="list": Safari drops list semantics when list-style is none.
  return (
    <ol role="list" className="space-y-4">
      {children}
    </ol>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="sr-only">Step {n}: </span>
      <span
        aria-hidden="true"
        className="shrink-0 inline-flex items-center justify-center text-[var(--ink)]"
        style={{
          width: "24px",
          height: "24px",
          borderRadius: "999px",
          border: "1px solid var(--hairline)",
          fontSize: "12px",
          fontWeight: 600,
          marginTop: "1px",
        }}
      >
        {n}
      </span>
      <div className="flex-1 min-w-0 text-[var(--ink)]" style={{ fontSize: "15px", lineHeight: 1.5 }}>
        {children}
      </div>
    </li>
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

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[var(--ink-muted)]"
      style={{
        fontSize: "13px",
        lineHeight: 1.5,
        borderLeft: "2px solid var(--hairline)",
        paddingLeft: "12px",
      }}
    >
      {children}
    </p>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong style={{ fontWeight: 600 }}>{children}</strong>;
}

function SectionLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="uppercase text-[var(--ink-faint)]"
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
