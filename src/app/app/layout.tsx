import { ClientShell } from "./_client-shell";

/**
 * Thin server layout that wraps both /app and /app/login. The real
 * subscription gate is server-rendered in src/app/app/(authed)/page.tsx;
 * the client-side ClientShell handles PWA service worker registration
 * and cross-page redirects on auth state changes.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ClientShell>{children}</ClientShell>;
}
