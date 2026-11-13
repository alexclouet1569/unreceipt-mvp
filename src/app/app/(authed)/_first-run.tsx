"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Camera, Check, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IntakeRow } from "@/components/IntakeRow";
import { ForwardingUnavailable } from "./_forwarding-unavailable";
import { ConnectButtons } from "./settings/mailboxes/ConnectButtons";
import { NO_PROVIDERS, anyProvider, providerNames, type MailboxProviders } from "./settings/mailboxes/copy";

export type FirstRunStep = 1 | 2 | 3;

/**
 * First-run onboarding (launch plan action 47), shown in place of the empty
 * inbox until finished or skipped: your forwarding address → snap your
 * first receipt → done. When Gmail / Outlook can be connected, step 1 is
 * "Connect your email" instead, with the address as the second way in.
 * Layout follows DESIGN.md's empty state (64×64
 * brand-tint mark, display-lg title, accent subtitle, hero spacing).
 */
export function FirstRun({
  step,
  forwardingEmail,
  mailboxProviders = NO_PROVIDERS,
  connectedMailboxes = [],
  onNext,
  onCapture,
  onFinish,
}: {
  step: FirstRunStep;
  forwardingEmail: string | null;
  mailboxProviders?: MailboxProviders;
  // Addresses already connected (back from Google's / Microsoft's screen).
  connectedMailboxes?: string[];
  onNext: () => void;
  onCapture: () => void;
  onFinish: () => void;
}) {
  const Icon = step === 1 ? Mail : step === 2 ? Camera : Check;
  // Each step replaces the button that was just pressed; move focus to the
  // new step's title so keyboard and screen-reader users land on it.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    titleRef.current?.focus();
  }, [step]);

  return (
    <section
      aria-labelledby="first-run-title"
      className="flex flex-col items-center text-center px-2"
      style={{ paddingTop: "48px", paddingBottom: "48px" }}
    >
      <p
        className="text-[var(--ink-muted)]"
        style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}
      >
        Step {step} of 3
      </p>
      <div className="flex gap-1.5" style={{ margin: "10px 0 24px" }} aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className="block rounded-full"
            style={{
              width: n === step ? "20px" : "6px",
              height: "6px",
              // Ink, not brand green: green appears once per screen (the CTA).
              background: n <= step ? "var(--ink)" : "var(--hairline)",
              transition: "width 200ms cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          />
        ))}
      </div>

      <div
        className="flex items-center justify-center"
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "20px",
          background: "var(--brand-tint)",
          marginBottom: "20px",
        }}
        aria-hidden="true"
      >
        <Icon className="w-7 h-7 text-[var(--brand)]" />
      </div>

      {step === 1 && connectedMailboxes.length > 0 ? (
        <>
          <Title titleRef={titleRef}>Your email is connected</Title>
          <Subtitle>
            Receipts from {connectedMailboxes.join(", ")} arrive by themselves.
            Those from the last 30 days are being imported; they appear under
            Review needed.
          </Subtitle>
          <Actions>
            <Button type="button" className="w-full h-12 text-[15px]" onClick={onNext}>
              Next
            </Button>
            <SkipButton onClick={onFinish}>Skip intro</SkipButton>
          </Actions>
        </>
      ) : step === 1 && anyProvider(mailboxProviders) ? (
        <>
          <Title titleRef={titleRef}>Connect your email</Title>
          <Subtitle>
            Connect {providerNames(mailboxProviders)} and receipts in your
            inbox arrive here by themselves, ready to check.
          </Subtitle>
          <div className="w-full max-w-[340px] space-y-3" style={{ marginBottom: "16px" }}>
            {/* Outlined, a pair of equal choices: the green is the next
                screen's Continue (DESIGN.md: one green per screen). */}
            <ConnectButtons providers={mailboxProviders} stacked />
            {forwardingEmail ? (
              <IntakeRow
                callout="Or forward receipts to"
                value={forwardingEmail}
                mono
                copyLabel="Copy forwarding address"
                quiet
              />
            ) : (
              <ForwardingUnavailable />
            )}
            <GuideLink instead />
          </div>
          <Actions>
            <SkipButton onClick={onNext}>Not now</SkipButton>
            <SkipButton onClick={onFinish}>Skip intro</SkipButton>
          </Actions>
        </>
      ) : step === 1 ? (
        <>
          <Title titleRef={titleRef}>Your private receipts address</Title>
          <Subtitle>
            Every email sent to this address becomes a receipt in UnReceipt:
            we read the shop, date, total and VAT. Forward receipts by hand,
            or set a rule once in your email so they arrive by themselves.
          </Subtitle>
          <div className="w-full max-w-[340px]" style={{ marginBottom: "24px" }}>
            {forwardingEmail ? (
              <IntakeRow
                callout="Forward email receipts to"
                value={forwardingEmail}
                mono
                copyLabel="Copy forwarding address"
              />
            ) : (
              <ForwardingUnavailable />
            )}
            <GuideLink />
          </div>
          <Actions>
            <Button type="button" className="w-full h-12 text-[15px]" onClick={onNext}>
              Next
            </Button>
            <SkipButton onClick={onFinish}>Skip intro</SkipButton>
          </Actions>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Title titleRef={titleRef}>Snap your first receipt</Title>
          <Subtitle>
            Take a photo of a paper receipt or upload a PDF. We read the shop,
            date, total and VAT for you — you check and save.
          </Subtitle>
          <Actions>
            <Button type="button" className="w-full h-12 gap-2 text-[15px]" onClick={onCapture}>
              <Camera className="w-4 h-4" />
              Take a photo
            </Button>
            <SkipButton onClick={onNext}>I&apos;ll do it later</SkipButton>
          </Actions>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Title titleRef={titleRef}>You&apos;re all set</Title>
          <Subtitle>
            Every receipt you forward or snap shows up here. Open one to
            download its PDF; Settings has a monthly export for your
            accountant.
          </Subtitle>
          <Actions>
            <Button type="button" className="w-full h-12 text-[15px]" onClick={onFinish}>
              Go to my receipts
            </Button>
          </Actions>
        </>
      ) : null}
    </section>
  );
}

function Title({
  children,
  titleRef,
}: {
  children: React.ReactNode;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <h2
      id="first-run-title"
      ref={titleRef}
      tabIndex={-1}
      className="font-display font-bold text-[var(--ink)] outline-none"
      style={{ fontSize: "22px", letterSpacing: "-0.02em", marginBottom: "8px" }}
    >
      {children}
    </h2>
  );
}

// Several sentences of guidance: Manrope body, not the italic accent face
// (DESIGN.md keeps Figtree italic for short callouts).
function Subtitle({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[var(--ink-muted)] max-w-[320px] [overflow-wrap:anywhere]"
      style={{ fontSize: "15px", lineHeight: 1.5, marginBottom: "24px" }}
    >
      {children}
    </p>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="w-full max-w-[340px] space-y-2">{children}</div>;
}

function SkipButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
      style={{ minHeight: "44px", fontSize: "14px", fontWeight: 500 }}
    >
      {children}
    </button>
  );
}

// Leads to the step-by-step forwarding guide. Leaving mid-onboarding is
// fine: the intro shows again on return until it's finished or skipped.
// `instead`: Connect Gmail / Outlook leads on this screen, so forwarding
// is offered as the other way.
export function GuideLink({ instead = false }: { instead?: boolean }) {
  return (
    <Link
      href="/app/settings/forwarding"
      className="inline-flex items-center text-[var(--ink-muted)] hover:text-[var(--ink)] underline underline-offset-2 transition-colors"
      style={{ minHeight: "44px", fontSize: "14px", fontWeight: 500 }}
    >
      {instead ? "Set up forwarding instead, step by step" : "Make it automatic, step by step (3 min)"}
    </Link>
  );
}
