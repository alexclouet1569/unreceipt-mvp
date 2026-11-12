import { ReceiptsSkeleton } from "@/components/PageSkeleton";

// Shown at once while /app reads the receipts (the gate and list are server-rendered).
export default function Loading() {
  return <ReceiptsSkeleton />;
}
