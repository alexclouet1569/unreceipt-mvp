import { MarketingDocument, ROOT_METADATA } from "../_root-document";

// English marketing pages (`/`, `/accountants`, guides, `/privacy`…). The
// route group only exists to give them their own root layout; it doesn't
// change any URL. A new English marketing page goes in this folder.

// Prerendered at build time; reading the request here fails the build.
export const dynamic = "error";

export const metadata = ROOT_METADATA;

export default function EnglishRootLayout({ children }: { children: React.ReactNode }) {
  return <MarketingDocument lang="en">{children}</MarketingDocument>;
}
