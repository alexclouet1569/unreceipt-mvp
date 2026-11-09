import { Card, CardContent } from "@/components/ui/card";
import { requireAdminPage } from "@/lib/require-admin";
import { loadPilotOverview, WINDOW_DAYS, type PilotOverview } from "@/lib/admin/pilot";
import { AutoRefresh } from "./_auto-refresh";
import { CreateFirmForm } from "./_create-firm";

export const dynamic = "force-dynamic";

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "short" })
    : "—";

/**
 * The pilot, live: set up a firm for an accountant, then watch her
 * clients connect and their receipts, reminders and bank imports arrive.
 * Counts only (src/lib/admin/pilot.ts).
 */
export default async function AdminPilotPage() {
  await requireAdminPage();
  let overview: PilotOverview | null = null;
  try {
    overview = await loadPilotOverview();
  } catch (err) {
    console.error("[/admin/pilot] load failed", err instanceof Error ? err.message : "unknown");
  }
  const renderedAt = new Date().toISOString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Pilot</h1>
          <p className="text-sm text-muted-foreground">Accounting firms, their clients and what happened in the last {WINDOW_DAYS} days.</p>
        </div>
        <AutoRefresh renderedAt={renderedAt} />
      </div>

      <Card>
        <CardContent className="py-4 space-y-2">
          <h2 className="text-sm font-semibold">Set up an accounting firm</h2>
          <p className="text-xs text-muted-foreground">
            The accountant gets an email and lands in her firm portal on her first sign-in with this address. From there she invites her clients.
          </p>
          <CreateFirmForm />
        </CardContent>
      </Card>

      {overview === null ? (
        <Card>
          <CardContent className="py-6 text-sm text-amber-700">Couldn&apos;t load the pilot data. Has the 2026-11-09 schema block been applied?</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="pilot-totals">
            {[
              ["Firms", overview.totals.firms],
              ["Clients connected", overview.totals.clients],
              ["Receipts this week", overview.totals.receiptsThisWeek],
              ["Receipts to complete", overview.totals.toComplete],
              ["Reminders this week", overview.totals.remindersThisWeek],
            ].map(([label, n]) => (
              <Card key={label as string}>
                <CardContent className="py-3">
                  <p className="text-2xl font-semibold tabular-nums">{n}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Firms</h2>
              {overview.firms.length === 0 ? (
                <p className="text-sm text-muted-foreground">No firm yet. Set one up above.</p>
              ) : null}
              {overview.firms.map((f) => (
                <Card key={f.id}>
                  <CardContent className="py-4 space-y-3">
                    <div>
                      <p className="font-medium">{f.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.members
                          .map((m) => `${m.email} (${m.role}${m.signedIn ? "" : ", not signed in yet"})`)
                          .join(" · ") || "No people"}
                      </p>
                    </div>
                    {f.clients.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No client connected yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-muted-foreground">
                            <tr className="text-left">
                              <th className="py-1 pr-2 font-medium">Client</th>
                              <th className="py-1 pr-2 font-medium text-right">Receipts</th>
                              <th className="py-1 pr-2 font-medium text-right">This week</th>
                              <th className="py-1 pr-2 font-medium text-right">To complete</th>
                              <th className="py-1 pr-2 font-medium text-right">To confirm</th>
                              <th className="py-1 pr-2 font-medium">Last receipt</th>
                              <th className="py-1 pr-2 font-medium">Reminder</th>
                            </tr>
                          </thead>
                          <tbody>
                            {f.clients.map((c) => (
                              <tr key={c.organizationId} className="border-t">
                                <td className="py-1.5 pr-2">
                                  {c.name}
                                  <span className="block text-muted-foreground">
                                    {Object.entries(c.bySource)
                                      .map(([s, n]) => `${n} ${s}`)
                                      .join(", ") || "no receipts yet"}
                                    {c.bankLines > 0 ? ` · ${c.bankLines} bank lines` : ""}
                                  </span>
                                </td>
                                <td className="py-1.5 pr-2 text-right tabular-nums">{c.receipts}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums">{c.thisWeek}</td>
                                <td className={`py-1.5 pr-2 text-right tabular-nums ${c.toComplete > 0 ? "text-red-700 font-medium" : ""}`}>{c.toComplete}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums">{c.toConfirm}</td>
                                <td className="py-1.5 pr-2">{when(c.lastReceiptAt)}</td>
                                <td className="py-1.5 pr-2">
                                  {c.weeklyReminder ? "weekly" : "off"}
                                  {c.lastReminderAt ? <span className="block text-muted-foreground">last {when(c.lastReminderAt)}</span> : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {f.invited.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Waiting: {f.invited.map((i) => `${i.name} (since ${when(i.since)})`).join(", ")}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold">What&apos;s happening</h2>
              <Card>
                <CardContent className="py-2">
                  {overview.feed.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">Nothing yet.</p>
                  ) : (
                    <ul className="divide-y" data-testid="pilot-feed">
                      {overview.feed.map((e, i) => (
                        <li key={`${e.at}-${i}`} className="py-2 text-xs">
                          <span className="text-muted-foreground tabular-nums">{when(e.at)}</span>{" "}
                          <span className="font-medium">{e.client ?? e.firm}</span>
                          {e.client ? <span className="text-muted-foreground"> ({e.firm})</span> : null}
                          <span className="block">{e.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
