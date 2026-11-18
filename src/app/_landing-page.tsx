import type { Locale } from "@/lib/locale";
import { getFaq } from "@/lib/faq";
import { LANDING_COPY } from "./_landing-copy";
import { LandingView } from "./_landing";
import { landingReceipt } from "./_receipt-text";
import { AudienceTabs, SiteFooter, SiteHeader } from "./_site-chrome";
import { ContactSection } from "./_contact-section";
import { DEMO_REQUEST_COPY } from "./_demo-request-copy";
import { appUrl, SIGNUP_PATH } from "@/lib/app-url";
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
      bookDemoLabel={SITE_COPY[locale].nav.bookDemo}
      faq={getFaq(pilotMode, locale)}
      receipt={landingReceipt(locale)}
      header={<SiteHeader locale={locale} page="home" pilotMode={pilotMode} />}
      audienceTabs={<AudienceTabs locale={locale} />}
      footer={<SiteFooter locale={locale} />}
      contact={
        <ContactSection
          locale={locale}
          copy={DEMO_REQUEST_COPY[locale]}
          bookingUrl={process.env.NEXT_PUBLIC_DEMO_BOOKING_URL ?? null}
          signup={{
            href: appUrl(SIGNUP_PATH),
            label: pilotMode ? LANDING_COPY[locale].hero.ctaPilot : LANDING_COPY[locale].hero.ctaPaid,
          }}
        />
      }
    />
  );
}
