import { redirect } from "next/navigation";

// The old side-by-side firm demo became the guided accountant tour.
export default function OldFirmDemo() {
  redirect("/demo/accountant?step=1");
}
