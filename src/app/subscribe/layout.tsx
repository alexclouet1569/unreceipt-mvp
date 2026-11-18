import { ProductDocument, ROOT_METADATA } from "../_root-document";

// Root layout of /subscribe (see src/app/_root-document.tsx).
export const metadata = ROOT_METADATA;

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ProductDocument>{children}</ProductDocument>;
}
