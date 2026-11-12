import { SettingsSkeleton } from "@/components/PageSkeleton";

// Shown at once while Settings reads the account, usage and accountant links.
export default function Loading() {
  return <SettingsSkeleton />;
}
