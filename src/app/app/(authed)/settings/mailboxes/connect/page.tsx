import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Mail } from "lucide-react";
import { getServerUser } from "@/lib/supabase-server";
import { isMailboxProviderId } from "@/lib/mailboxes/types";
import { cn } from "@/lib/utils";
import { loadMailboxProviders } from "../load";
import { OUTLINE_LINK, PRIMARY_LINK } from "../ConnectButtons";
import {
  GOOGLE_UNVERIFIED_NOTE,
  PERMISSION_NOTE,
  PROVIDER_COMPANY,
  PROVIDER_NAME,
  WHAT_WE_READ,
  connectHref,
} from "../copy";

// Our one screen before Google's or Microsoft's: what UnReceipt reads, in
// one sentence, then the provider's own consent screen. Continue is a plain
// link to GET /api/mailboxes/connect/<provider> (the user's session starts
// the flow there); a form POST would be blocked by the site's CSP
// form-action 'self' on the redirect to the provider.
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ provider?: string | string[] }> };

/**
 * Google shows "Google hasn't verified this app" until its review is done
 * (gmail.readonly is a restricted scope). Set GOOGLE_OAUTH_VERIFIED=true
 * once it is, and the note goes away.
 */
function googleVerified(): boolean {
  return process.env.GOOGLE_OAUTH_VERIFIED === "true";
}

export default async function ConnectMailboxPage({ searchParams }: Props) {
  const user = await getServerUser();
  if (!user) redirect("/app/login?next=/app/settings");

  const raw = (await searchParams).provider;
  const provider = Array.isArray(raw) ? raw[0] : raw;
  // Unknown or not set up here (preview, dev): back to Settings.
  if (!isMailboxProviderId(provider) || !loadMailboxProviders()[provider]) {
    redirect("/app/settings");
  }

  const name = PROVIDER_NAME[provider];
  const company = PROVIDER_COMPANY[provider];

  return (
    <div>
      <div className="mx-auto max-w-[540px] px-4 py-4 max-sm:pb-[calc(env(safe-area-inset-bottom,0px)+88px)]">
        <Link
          href="/app/settings"
          className="-ml-2 inline-flex h-11 items-center gap-1 rounded-[10px] px-2 text-[14px] font-semibold text-[var(--ink-muted)] outline-none transition-colors duration-100 hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Settings
        </Link>

        <div className="mt-4 flex flex-col items-center text-center">
          <div
            aria-hidden="true"
            className="flex items-center justify-center"
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "20px",
              background: "var(--brand-tint)",
              marginBottom: "20px",
            }}
          >
            <Mail className="h-7 w-7 text-[var(--brand)]" />
          </div>
          <h1 className="type-display-lg text-[var(--ink)]">Connect {name}</h1>
        </div>

        <div
          className="mt-6 space-y-3 bg-card"
          style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "14px 16px" }}
        >
          <p className="type-body text-[var(--ink)]">{WHAT_WE_READ}</p>
          <p className="type-body text-[var(--ink-muted)]">{PERMISSION_NOTE[provider]}</p>
          {provider === "google" && !googleVerified() ? (
            <p
              data-testid="google-unverified"
              className="type-caption rounded-[10px] px-3 py-2 text-[var(--attention-deep)]"
              style={{ background: "var(--attention-tint)" }}
            >
              {GOOGLE_UNVERIFIED_NOTE}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          {/* A plain <a>, not next/link: no prefetch, and a full page load
              that the route can redirect to the provider. */}
          <a href={connectHref(provider)} className={cn(PRIMARY_LINK, "w-full")}>
            Continue to {company}
          </a>
          <Link href="/app/settings" className={cn(OUTLINE_LINK, "w-full")}>
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
