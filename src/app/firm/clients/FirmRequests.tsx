"use client";

import { useRouter } from "next/navigation";
import { RequestAnswer } from "@/app/app/firm-request/RequestAnswer";

export type FirmRequest = { id: string; clientName: string };

/**
 * Client companies that invited this accountant (direction 'client'),
 * matched to the signed-in, confirmed address server-side. Accepting here
 * is the same POST /api/firm-request/respond as the email link.
 */
export function FirmRequests({ requests }: { requests: FirmRequest[] }) {
  const router = useRouter();
  if (requests.length === 0) return null;
  return (
    <section aria-labelledby="firm-requests" className="space-y-3 mb-8">
      <h2 id="firm-requests" className="font-display font-bold text-[var(--ink)]" style={{ fontSize: "18px" }}>
        Asking to share with you
      </h2>
      <ul role="list" className="space-y-3">
        {requests.map((r) => (
          <li
            key={r.id}
            className="bg-card space-y-3"
            style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
          >
            <p className="text-[var(--ink)]" style={{ fontSize: "15px", fontWeight: 600 }}>
              {r.clientName} wants to share their receipts with you
            </p>
            <RequestAnswer
              inviteId={r.id}
              clientName={r.clientName}
              needsFirm={false}
              onDone={() => router.refresh()}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
