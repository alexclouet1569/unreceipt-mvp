import { redirect } from "next/navigation";
import { getSessionClaims } from "@/lib/supabase-server";
import { hasSecondFactor } from "@/lib/auth-admin";
import { requireAdminPage } from "@/lib/require-admin";
import { AdminMfaForm } from "./_mfa-form";

export const dynamic = "force-dynamic";

/**
 * The admin's second sign-in step (2026-11-18). Admins can read every
 * customer's data, so /admin and /api/admin require an authenticator-app
 * code on top of the email code or password (`aal2`). The first visit sets
 * up the authenticator; later visits ask for its code.
 *
 * Lost phone: remove the factor in the Supabase dashboard (Authentication →
 * Users → the admin → MFA factors) and set it up again here.
 */
export default async function AdminMfaPage() {
  await requireAdminPage({ allowWithoutMfa: true });
  if (hasSecondFactor(await getSessionClaims())) redirect("/admin");

  return (
    <div className="max-w-sm space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Second sign-in step</h1>
        <p className="text-sm text-muted-foreground">
          Admin pages show every customer&apos;s data, so they need a code from an authenticator app
          (1Password, Google Authenticator, Microsoft Authenticator…) as well as your sign-in.
        </p>
      </div>
      <AdminMfaForm />
    </div>
  );
}
