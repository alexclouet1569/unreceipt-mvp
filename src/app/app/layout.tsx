import { ProductDocument, ROOT_METADATA } from "../_root-document";
import { ClientShell } from "./_client-shell";

export const metadata = ROOT_METADATA;

/**
 * Root layout of /app (both /app and /app/login), see
 * `src/app/_root-document.tsx`. The real
 * subscription gate is server-rendered in src/app/app/(authed)/page.tsx;
 * the client-side ClientShell handles PWA service worker registration
 * and cross-page redirects on auth state changes.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProductDocument>
      <ClientShell>{children}</ClientShell>
    </ProductDocument>
  );
}
