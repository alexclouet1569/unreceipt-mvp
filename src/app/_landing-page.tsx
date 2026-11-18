import type { Locale } from "@/lib/locale";
import { getFaq } from "@/lib/faq";
import { LANDING_COPY } from "./_landing-copy";
import { LandingView } from "./_landing";
import { landingReceipt } from "./_receipt-text";
import { SiteFooter } from "./_site-chrome";
import { SITE_COPY } from "./_site-copy";

/**
 * The landing page (`/`, `/sv`, `/fr`). A server component: it picks this
 * language's copy, FAQ and receipt and hands only those to the client view,
 * so the copy of the other languages never reaches the browser.
 */
export function LandingPage({ pilotMode, locale = "en" }: { pilotMode: boolean; locale?: Locale }) {
  return (
    <LandingView
      pilotMode={pilotMode}
      locale={locale}
      copy={LANDING_COPY[locale]}
      accountantsLabel={SITE_COPY[locale].nav.accountants}
      bookDemoLabel={SITE_COPY[locale].nav.bookDemo}
      faq={getFaq(pilotMode, locale)}
      receipt={landingReceipt(locale)}
      footer={<SiteFooter locale={locale} />}
    />
  );
}
