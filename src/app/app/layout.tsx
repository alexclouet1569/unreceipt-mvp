import { I18nProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";
import { ClientShell } from "./_client-shell";

/**
 * Thin server layout that wraps both /app and /app/login. The real
 * subscription gate is server-rendered in src/app/app/(authed)/page.tsx;
 * the client-side ClientShell handles PWA service worker registration
 * and cross-page redirects on auth state changes. The language (English,
 * French or Swedish) is picked here for every product screen.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale}>
      <ClientShell>{children}</ClientShell>
    </I18nProvider>
  );
}
