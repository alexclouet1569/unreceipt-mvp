import { ArrowRight } from "lucide-react";
import type { DemoRequestLocale } from "@/lib/demo-request";
import { trackedLink } from "@/lib/tracking/events";
import type { DemoRequestCopy } from "./_demo-request-copy";
import { DemoRequestForm } from "./_demo-request-form";

/**
 * The demo block at the end of the home and audience pages: the same demo
 * form as the demo request page (its title links to the contact page for
 * anything else), next to a few words and a small link for those who'd
 * rather sign up on their own.
 * No hooks, so the landing page (a client component) and the audience
 * pages (server components) both render it; it takes one language's copy
 * as props, so the other languages never reach the browser.
 */
export function ContactSection({
  locale,
  copy,
  bookingUrl,
  signup,
}: {
  locale: DemoRequestLocale;
  copy: Pick<DemoRequestCopy, "contact" | "form" | "sent">;
  bookingUrl: string | null;
  signup: { href: string; label: string };
}) {
  return (
    <section id="contact" aria-labelledby="contact-title" className="bg-[#303568] px-4 sm:px-6 py-16 sm:py-20 scroll-mt-20">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_minmax(0,520px)] gap-10 lg:gap-14 items-start">
        <div className="lg:pt-6">
          <p className="text-sm font-semibold text-[#7FE0B0] uppercase tracking-widest mb-3">{copy.contact.eyebrow}</p>
          <h2 id="contact-title" className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            {copy.contact.title}
          </h2>
          <p className="text-white/80 text-lg leading-relaxed max-w-xl mb-8">{copy.contact.lead}</p>
          <p className="text-white/80 text-sm">
            {copy.contact.signupLead}{" "}
            <a
              href={signup.href}
              {...trackedLink("cta_signup", { attribution: true })}
              className="inline-flex items-center gap-1 font-semibold text-white underline underline-offset-2 hover:text-[#7FE0B0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {signup.label}
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          </p>
        </div>
        <div className="bg-white rounded-3xl border border-[#E8E5DD] p-5 sm:p-7 w-full">
          <DemoRequestForm
            locale={locale}
            copy={{ form: copy.form, sent: copy.sent }}
            bookingUrl={bookingUrl}
            idPrefix="contact"
            headingLevel={3}
          />
        </div>
      </div>
    </section>
  );
}
