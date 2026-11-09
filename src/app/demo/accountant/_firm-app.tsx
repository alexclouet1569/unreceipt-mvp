"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ClientsView, ClientView, FirmShell, SettingsView, type ActiveClient, type PendingInvite } from "@/app/firm/_views";
import type { MemberView } from "@/app/firm/settings/MembersSection";
import { computeClientStats, monthKey, receiptMonth, resolveMonth, type StatRow } from "@/lib/firm/client-stats";
import { buildBookkeepingCsv } from "@/lib/bookkeeping/bookkeeping-csv";
import { buildReceiptsCsv } from "@/lib/export/csv";
import { editMarker } from "@/lib/receipts/edits";
import { computeReceiptStatus } from "@/lib/receipts/status";
import { formatDate } from "@/lib/receipt-format";
import type { BankTransaction, Receipt } from "@/lib/types";
import { buildBankMonth } from "@/lib/bank/month";
import { parseBankStatement } from "@/lib/bank/parse-statement";
import { isNoReceiptReason } from "@/lib/bank/match";

// Sample data and browser-side stand-ins for every route the firm portal
// calls, for the public accountant tour (/demo/accountant). Nothing reaches
// the database, Resend or Claude.

export type DemoParams = {
  view: "clients" | "client" | "settings";
  org: string | null;
  month: string | null;
};

const FIRM = "Bergström Redovisning AB";
const ME = { id: "m-anna", email: "anna@bergstrom-redovisning.se" };
const STAFF_USER = "demo-staff-anna";
const CLIENT_EMAIL = "maja@nordljusdesign.se";

export const ORG_HB = "11111111-1111-4111-8111-000000000001";
const ORG_CS = "11111111-1111-4111-8111-000000000002";
const ORG_ND = "11111111-1111-4111-8111-000000000003";

// ---- dates -----------------------------------------------------------------

const now = new Date();
const thisMonth = monthKey(now.toISOString());
const [cy, cm] = thisMonth.split("-").map(Number);
const inMonth = (day: number, monthsBack = 0) => {
  const d = new Date(Date.UTC(cy, cm - 1 - monthsBack, day, 12));
  return d.toISOString();
};
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();

// ---- receipts --------------------------------------------------------------

let seq = 0;
const receipt = (over: Partial<Receipt>): Receipt => {
  const purchased = over.purchased_at ?? inMonth(2);
  return {
    id: `demo-r-${String(++seq).padStart(2, "0")}`,
    transaction_id: null,
    user_id: "demo-client",
    source: "paper",
    merchant_name: "Shop",
    merchant_address: null,
    merchant_phone: null,
    merchant_vat_number: null,
    merchant_siret: null,
    category: "other",
    currency: "SEK",
    notes: null,
    receipt_number: null,
    receipt_date: purchased.slice(0, 10),
    receipt_time: null,
    purchased_at: purchased,
    subtotal: null,
    tax_amount: null,
    tax_rate: null,
    tip_amount: null,
    total: 100,
    payment_method: "Card",
    card_last_four: null,
    transaction_ref: null,
    image_url: null,
    image_captured_at: null,
    status: "verified",
    verification_code: null,
    capture_time_seconds: null,
    ocr_confidence: null,
    is_verified: false,
    original_source_url: null,
    original_source_kind: null,
    intake_ref: null,
    parse_confidence: null,
    items: null,
    edited_at: null,
    edited_fields: null,
    edit_history: null,
    organization_id: ORG_HB,
    seller_org_number: null,
    vat_lines: null,
    bas_account: null,
    exported_at: null,
    exported_by: null,
    booked_at: null,
    booked_by: null,
    booked_ref: null,
    home_currency: null,
    home_total: null,
    fx_rate: null,
    fx_date: null,
    fx_source: null,
    created_at: hoursAgo(30),
    updated_at: hoursAgo(30),
    ...over,
  };
};

const emailFrom = (from: string, subject: string, text: string) => ({ from, subject, text });

// Email originals shown in the Original tab, by receipt id.
const EML: Record<string, { from: string; subject: string; text: string }> = {};
// PDF originals (generated in the browser), by receipt id.
const PDF: Record<string, string[]> = {};

const initialReceipts = (): Receipt[] => {
  const rows: Receipt[] = [];
  const add = (r: Receipt, eml?: { from: string; subject: string; text: string }, pdf?: string[]) => {
    rows.push(r);
    if (eml) EML[r.id] = eml;
    if (pdf) PDF[r.id] = pdf;
  };

  // Hallonbergen Bygg AB — a busy month.
  add(
    receipt({
      merchant_name: "Byggmax",
      category: "office_supplies",
      total: 2486,
      tax_amount: 497.2,
      tax_rate: 25,
      seller_org_number: "556551-2231",
      merchant_vat_number: "SE556551223101",
      purchased_at: inMonth(1),
      source: "email",
      original_source_kind: "eml",
      created_at: hoursAgo(20),
      items: [
        { label: "Skruvdragare 18V", qty: 1, unit_amount: 1795, total_amount: 1795 },
        { label: "Bits-sats 32 delar", qty: 1, unit_amount: 299, total_amount: 299 },
        { label: "Arbetshandskar", qty: 4, unit_amount: 98, total_amount: 392 },
      ],
    }),
    emailFrom("kvitto@byggmax.se", "Ditt kvitto från Byggmax", "Tack för ditt köp!\n\nSkruvdragare 18V      1 795,00\nBits-sats 32 delar      299,00\nArbetshandskar 4 st     392,00\n\nTotalt          2 486,00 kr\nVarav moms 25 %   497,20 kr\n\nByggmax AB · Org.nr 556551-2231")
  );
  add(
    receipt({
      merchant_name: "Ahlsell",
      category: "other",
      total: 3912.5,
      tax_amount: 782.5,
      tax_rate: 25,
      seller_org_number: "556067-7458",
      purchased_at: inMonth(2),
      source: "email",
      status: "pending_review",
      parse_confidence: 0.7,
      original_source_kind: "application/pdf",
      original_source_url: "demo/ahlsell.pdf",
      created_at: hoursAgo(5),
      payment_method: "Invoice",
    }),
    undefined,
    ["Ahlsell AB", "Org.nr 556067-7458", "", "FAKTURA 7714 220", "Kopparrör 15 mm, 10 m      1 840,00", "Pressfittings 15 mm x 20  1 290,00", "", "Netto            3 130,00", "Moms 25 %          782,50", "Att betala       3 912,50 SEK"]
  );
  add(
    receipt({
      merchant_name: "Restaurang Tranan",
      category: "client_entertainment",
      total: 1340,
      tax_amount: 164,
      vat_lines: [
        { rate: 12, net: 1000, vat: 120 },
        { rate: 25, net: 176, vat: 44 },
      ],
      seller_org_number: "556123-9988",
      merchant_vat_number: "SE556123998801",
      purchased_at: inMonth(3),
      notes: "Lunch with the client from Bromma, 3 people",
      created_at: hoursAgo(40),
    })
  );
  add(
    receipt({
      merchant_name: "Circle K",
      category: "transport",
      total: 812,
      tax_amount: 162.4,
      tax_rate: 25,
      purchased_at: inMonth(1),
      exported_at: hoursAgo(26),
      exported_by: STAFF_USER,
      booked_at: hoursAgo(25),
      booked_by: STAFF_USER,
      booked_ref: "V 1042",
      created_at: hoursAgo(100),
    })
  );
  add(
    receipt({
      merchant_name: "Adobe",
      category: "software",
      currency: "EUR",
      total: 24.19,
      tax_amount: 4.84,
      tax_rate: 25,
      purchased_at: inMonth(2),
      home_currency: "SEK",
      home_total: 277.02,
      fx_rate: 11.452,
      fx_date: inMonth(2).slice(0, 10),
      fx_source: "ecb",
      source: "email",
      original_source_kind: "eml",
      created_at: hoursAgo(60),
    }),
    emailFrom("message@adobe.com", "Your Adobe invoice", "Adobe Systems Software Ireland Ltd\nCreative Cloud Photography plan\n\nSubtotal  EUR 19.35\nVAT (25%) EUR 4.84\nTotal     EUR 24.19")
  );
  add(
    receipt({
      merchant_name: null,
      category: "other",
      total: null,
      tax_amount: null,
      purchased_at: inMonth(3),
      source: "email",
      status: "pending_review",
      original_source_kind: "eml",
      notes: "Subject: Fwd: kvitto",
      created_at: hoursAgo(3),
    }),
    emailFrom("johan@hallonbergenbygg.se", "Fwd: kvitto", "Hej, kvittot från parkeringen i går.\n\n(The photo was too blurry to read: complete the merchant, total and date by hand.)")
  );
  add(
    receipt({
      merchant_name: "Clas Ohlson",
      category: "office_supplies",
      total: 245,
      tax_amount: 49,
      tax_rate: 25,
      purchased_at: inMonth(1),
      source: "paper",
      created_at: hoursAgo(80),
    })
  );
  // Last month, already exported.
  for (const [m, t, v] of [["Byggmax", 1520, 304], ["Preem", 690, 138]] as const) {
    add(
      receipt({
        merchant_name: m,
        category: m === "Preem" ? "transport" : "office_supplies",
        total: t,
        tax_amount: v,
        tax_rate: 25,
        purchased_at: inMonth(20, 1),
        exported_at: inMonth(28, 1),
        exported_by: STAFF_USER,
        created_at: inMonth(20, 1),
      })
    );
  }

  // Café Sjöstaden AB — food and a phone bill.
  add(
    receipt({
      organization_id: ORG_CS,
      merchant_name: "Menigo",
      category: "meals",
      total: 4480,
      tax_amount: 480,
      tax_rate: 12,
      purchased_at: inMonth(2),
      created_at: hoursAgo(30),
    })
  );
  add(
    receipt({
      organization_id: ORG_CS,
      merchant_name: "Tele2",
      category: "other",
      total: 399,
      tax_amount: 79.8,
      tax_rate: 25,
      purchased_at: inMonth(1),
      source: "email",
      original_source_kind: "eml",
      created_at: hoursAgo(110),
    }),
    emailFrom("faktura@tele2.se", "Din faktura från Tele2", "Mobilabonnemang Företag\nAtt betala: 399,00 kr\nVarav moms: 79,80 kr")
  );
  add(
    receipt({
      organization_id: ORG_CS,
      merchant_name: "Martin & Servera",
      category: "meals",
      total: 2210,
      tax_amount: 236.79,
      purchased_at: inMonth(3),
      status: "pending_review",
      parse_confidence: 0.7,
      source: "email",
      original_source_kind: "application/pdf",
      original_source_url: "demo/ms.pdf",
      created_at: hoursAgo(8),
    }),
    undefined,
    ["Martin & Servera", "Följesedel / kvitto", "", "Kaffebönor 6 kg       1 420,00", "Mjölk 24 l              553,21", "", "Moms 12 %              236,79", "Summa                2 210,00 kr"]
  );

  // Nordljus Design AB — appears once Maja accepts the invite.
  add(
    receipt({
      organization_id: ORG_ND,
      merchant_name: "Figma",
      category: "software",
      currency: "USD",
      total: 15,
      tax_amount: null,
      purchased_at: inMonth(1),
      source: "email",
      created_at: hoursAgo(50),
    })
  );
  add(
    receipt({
      organization_id: ORG_ND,
      merchant_name: "SJ AB",
      category: "travel",
      total: 895,
      tax_amount: 50.66,
      tax_rate: 6,
      purchased_at: inMonth(2),
      created_at: hoursAgo(28),
    })
  );
  return rows;
};

// ---- firm side state ------------------------------------------------------

type ClientRow = ActiveClient & { status: "active" | "invited" | "revoked"; invited_email: string; created_at: string; invite_expires_at: string };

const initialClients = (): ClientRow[] => [
  { id: "fc-hb", organization_id: ORG_HB, client_name: "Hallonbergen Bygg AB", client_org_number: "559210-4471", status: "active", invited_email: "johan@hallonbergenbygg.se", created_at: inMonth(10, 1), invite_expires_at: inMonth(24, 1) },
  { id: "fc-cs", organization_id: ORG_CS, client_name: "Café Sjöstaden AB", client_org_number: "559388-0192", status: "active", invited_email: "linnea@cafesjostaden.se", created_at: inMonth(12, 1), invite_expires_at: inMonth(26, 1) },
  { id: "fc-nd", organization_id: ORG_ND, client_name: "Nordljus Design AB", client_org_number: "559501-3378", status: "invited", invited_email: CLIENT_EMAIL, created_at: hoursAgo(20), invite_expires_at: new Date(now.getTime() + 13 * 86400_000).toISOString() },
];

const initialMembers = (): MemberView[] => [
  { id: ME.id, email: ME.email, role: "admin", claimed: true },
  { id: "m-johan", email: "erik@bergstrom-redovisning.se", role: "staff", claimed: true },
  { id: "m-lisa", email: "lisa@bergstrom-redovisning.se", role: "staff", claimed: false },
];

// ---- tiny PDF for the Original tab ----------------------------------------

function makePdf(lines: string[]): string {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7E]/g, (c) => ({ "å": "a", "ä": "a", "ö": "o", "Å": "A", "Ä": "A", "Ö": "O" })[c] ?? "?");
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 16 : 11} Tf 56 ${780 - i * 22} Td (${esc(l)}) Tj ET`).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return URL.createObjectURL(new Blob([out], { type: "application/pdf" }));
}

// ---- bank statement ---------------------------------------------------------

// Hallonbergen's bank lines this month, as if the firm had imported the
// CSV: most payments have a receipt, five don't (one of them is the
// parking receipt still waiting for its amount), and a transfer is
// already marked "no receipt needed".
const initialBank = (): BankTransaction[] => {
  let n = 0;
  const line = (day: number, amount: number, description: string, over: Partial<BankTransaction> = {}): BankTransaction => ({
    id: `demo-b-${String(++n).padStart(2, "0")}`,
    organization_id: ORG_HB,
    booked_on: inMonth(day).slice(0, 10),
    amount,
    currency: "SEK",
    description,
    linked_receipt_id: null,
    no_receipt_reason: null,
    decided_by: null,
    decided_at: null,
    reminded_at: null,
    imported_by: STAFF_USER,
    imported_at: hoursAgo(2),
    ...over,
  });
  return [
    line(2, -2486, "KORTKÖP BYGGMAX BARKARBY"),
    line(2, -812, "CIRCLE K SOLLENTUNA"),
    line(3, -245, "CLAS OHLSON SOLNA"),
    line(3, -60, "EASYPARK SVERIGE"),
    line(3, -282.11, "ADOBE *CREATIVE CLD"),
    line(4, -1340, "RESTAURANG TRANAN STHLM"),
    line(4, -3912.5, "BG 5051-6905 AHLSELL"),
    line(5, -1249, "HORNBACH BARKARBY"),
    line(6, -655.4, "PREEM SOLLENTUNA"),
    line(6, -1800, "SWISH ELEKTRO-JONSSON"),
    line(6, -10000, "ÖVERFÖRING SPARKONTO", { no_receipt_reason: "transfer", decided_by: STAFF_USER, decided_at: hoursAgo(1) }),
    line(7, -45, "MÅNADSAVGIFT FÖRETAGSPAKET"),
  ];
};

// ---- helpers ----------------------------------------------------------------

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export type HrefFor = (p: Partial<DemoParams>) => string;

// ---- component ---------------------------------------------------------------

export function FirmApp({
  params,
  hrefFor,
  screenKey = "",
}: {
  params: DemoParams;
  hrefFor: HrefFor;
  // Changes per tour step, so each step opens the screen fresh (filters,
  // open dialogs) while the sample data keeps what was done before.
  screenKey?: string;
}) {
  const pathname = usePathname();
  const [receipts, setReceipts] = useState<Receipt[]>(initialReceipts);
  const [clients, setClients] = useState<ClientRow[]>(initialClients);
  const [members, setMembers] = useState<MemberView[]>(initialMembers);
  const [bankLines, setBankLines] = useState<BankTransaction[]>(initialBank);
  // Weekly reminder switch per client (on by default, like a real link).
  const [weeklyOff, setWeeklyOff] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);

  // Latest data for the fetch stub, which is installed once.
  const state = useRef({ receipts, clients, bankLines });
  useEffect(() => {
    state.current = { receipts, clients, bankLines };
  }, [receipts, clients, bankLines]);

  useEffect(() => {
    const realFetch = window.fetch;
    const pdfUrls = new Map<string, string>();

    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(url, window.location.origin).pathname;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      await new Promise((r) => setTimeout(r, 350));

      // Firm invites a client.
      if (path === "/api/firm/clients" && method === "POST") {
        const id = `fc-${Date.now()}`;
        setClients((prev) => [
          ...prev,
          {
            id,
            organization_id: `pending-${id}`,
            client_name: String(body.client_name ?? "").trim() || "New client",
            client_org_number: body.client_org_number || null,
            status: "invited",
            invited_email: String(body.email ?? "").trim().toLowerCase(),
            created_at: new Date().toISOString(),
            invite_expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
          },
        ]);
        return json({ ok: true, id, emailed: true }, 201);
      }
      let m = /^\/api\/firm\/links\/([^/]+)$/.exec(path);
      if (m && method === "DELETE") {
        const id = m[1];
        setClients((prev) => prev.map((c) => (c.id === id ? { ...c, status: "revoked" } : c)));
        return json({ ok: true });
      }

      // Firm export of one client's month: the two CSVs of the ZIP, built
      // by the same functions the server uses.
      m = /^\/api\/firm\/clients\/([^/]+)\/export$/.exec(path);
      if (m && method === "POST") {
        const org = m[1];
        const month = String(body.period);
        const onlyNew = body.unexportedOnly !== false;
        const rows = state.current.receipts.filter(
          (r) => r.organization_id === org && receiptMonth(r) === month && (!onlyNew || (!r.exported_at && r.status === "verified"))
        );
        if (rows.length === 0) return json({ receiptCount: 0, missing: 0, parts: [] });
        const csvRows = rows.map((r) => ({ receipt: r, pdfFile: r.status === "verified" ? `pdf/${r.id}.pdf` : null, originalFile: null }));
        const book = buildBookkeepingCsv(csvRows);
        const list = buildReceiptsCsv(csvRows);
        const blob = (s: string) => URL.createObjectURL(new Blob([s], { type: "text/csv;charset=utf-8" }));
        if (body.markExported !== false) {
          const stamp = new Date().toISOString();
          const ids = new Set(rows.filter((r) => r.status === "verified").map((r) => r.id));
          setReceipts((prev) => prev.map((r) => (ids.has(r.id) && !r.exported_at ? { ...r, exported_at: stamp, exported_by: STAFF_USER } : r)));
        }
        return json({
          receiptCount: rows.length,
          missing: 0,
          parts: [
            { filename: `bookkeeping-${month}.csv`, url: blob(book), bytes: book.length },
            { filename: `receipts-${month}.csv`, url: blob(list), bytes: list.length },
          ],
        });
      }

      // Bank statement: import, decide on a line, email the client, remove.
      m = /^\/api\/firm\/clients\/([^/]+)\/bank\/import$/.exec(path);
      if (m && method === "POST") {
        const org = m[1];
        const statement = parseBankStatement(String(body.csv ?? ""));
        if (!statement.ok) return json({ error: statement.error }, 422);
        const parsed = { ...statement, rows: statement.rows.filter((r) => r.amount < 0) };
        if (parsed.rows.length === 0) return json({ error: "This file has no payments out, only money in." }, 422);
        const existing = new Set(state.current.bankLines.filter((l) => l.organization_id === org).map((l) => `${l.booked_on}|${Number(l.amount).toFixed(2)}|${l.description}`));
        const added: BankTransaction[] = [];
        parsed.rows.forEach((r, i) => {
          if (existing.has(`${r.bookedOn}|${r.amount.toFixed(2)}|${r.description}`)) return;
          added.push({
            id: `demo-imp-${Date.now()}-${i}`,
            organization_id: org,
            booked_on: r.bookedOn,
            amount: r.amount,
            currency: r.currency ?? "SEK",
            description: r.description,
            linked_receipt_id: null,
            no_receipt_reason: null,
            decided_by: null,
            decided_at: null,
            reminded_at: null,
            imported_by: STAFF_USER,
            imported_at: new Date().toISOString(),
          });
        });
        setBankLines((prev) => [...prev, ...added]);
        const days = parsed.rows.map((r) => r.bookedOn).sort();
        return json({
          ok: true,
          lines: parsed.rows.length,
          imported: added.length,
          duplicates: parsed.rows.length - added.length,
          moneyIn: statement.rows.length - parsed.rows.length,
          skipped: parsed.skipped,
          from: days[0],
          to: days[days.length - 1],
          months: [...new Set(days.map((d) => d.slice(0, 7)))],
        });
      }
      m = /^\/api\/firm\/clients\/([^/]+)\/bank\/lines\/([^/]+)$/.exec(path);
      if (m && method === "PATCH") {
        const id = m[2];
        if (body.action === "link" && state.current.bankLines.some((l) => l.id !== id && l.linked_receipt_id === body.receiptId)) {
          return json({ error: "This receipt is already linked to another payment." }, 409);
        }
        setBankLines((prev) =>
          prev.map((l) =>
            l.id !== id
              ? l
              : {
                  ...l,
                  linked_receipt_id: body.action === "link" ? String(body.receiptId) : null,
                  no_receipt_reason: body.action === "no_receipt" && isNoReceiptReason(body.reason) ? body.reason : null,
                  decided_by: body.action === "clear" ? null : STAFF_USER,
                  decided_at: body.action === "clear" ? null : new Date().toISOString(),
                }
          )
        );
        return json({ ok: true });
      }
      m = /^\/api\/firm\/clients\/([^/]+)\/bank\/remind$/.exec(path);
      if (m && method === "POST") {
        const org = m[1];
        const view = buildBankMonth(
          state.current.bankLines.filter((l) => l.organization_id === org),
          state.current.receipts.filter((r) => r.organization_id === org),
          String(body.month)
        );
        const ids = new Set(view.lines.filter((l) => l.state.kind === "missing").map((l) => l.id));
        if (ids.size === 0) return json({ error: "Nothing is missing this month." }, 409);
        const stamp = new Date().toISOString();
        setBankLines((prev) => prev.map((l) => (ids.has(l.id) ? { ...l, reminded_at: stamp } : l)));
        setNotice("In the real portal the client's owners get this list by email, with you as Reply-To. The demo sends nothing.");
        return json({ ok: true, sent: 1, lines: ids.size, remindedAt: stamp });
      }
      m = /^\/api\/firm\/clients\/([^/]+)\/bank$/.exec(path);
      if (m && method === "DELETE") {
        const org = m[1];
        const month = new URL(url, window.location.origin).searchParams.get("month") ?? "";
        const removed = state.current.bankLines.filter((l) => l.organization_id === org && l.booked_on.startsWith(month)).length;
        setBankLines((prev) => prev.filter((l) => !(l.organization_id === org && l.booked_on.startsWith(month))));
        return json({ ok: true, removed });
      }

      // Weekly reminder switch.
      m = /^\/api\/firm\/clients\/([^/]+)\/reminders$/.exec(path);
      if (m && method === "PATCH") {
        const org = m[1];
        setWeeklyOff((prev) => {
          const next = new Set(prev);
          if (body.weekly === false) next.add(org);
          else next.delete(org);
          return next;
        });
        return json({ ok: true, weekly: body.weekly !== false });
      }

      // Mark as booked.
      m = /^\/api\/firm\/clients\/([^/]+)\/receipts\/book$/.exec(path);
      if (m && method === "POST") {
        const ids = new Set<string>(body.receiptIds ?? []);
        setReceipts((prev) =>
          prev.map((r) =>
            ids.has(r.id)
              ? body.booked === false
                ? { ...r, booked_at: null, booked_by: null, booked_ref: null }
                : { ...r, booked_at: new Date().toISOString(), booked_by: STAFF_USER, booked_ref: body.ref || null }
              : r
          )
        );
        return json({ ok: true, updated: ids.size });
      }

      // Complete review / edit, as the firm.
      m = /^\/api\/receipts\/([^/]+)$/.exec(path);
      if (m && method === "PATCH") {
        const id = m[1];
        let status: string = "verified";
        setReceipts((prev) =>
          prev.map((r) => {
            if (r.id !== id) return r;
            const update: Record<string, unknown> = {};
            if (body.merchant != null) update.merchant_name = body.merchant;
            if (body.amount != null) update.total = body.amount;
            if (body.currency != null) update.currency = body.currency;
            if (body.receipt_date != null) {
              update.receipt_date = body.receipt_date;
              update.purchased_at = `${body.receipt_date}T12:00:00.000Z`;
            }
            if (body.category != null) update.category = body.category;
            for (const k of ["notes", "tax_amount", "tax_rate", "payment_method", "items"]) {
              if (k in body) update[k] = body[k];
            }
            const merged = { ...r, ...update } as Receipt;
            status = computeReceiptStatus({
              merchant_name: merged.merchant_name,
              purchased_at: merged.purchased_at,
              receipt_date: merged.receipt_date,
              total: merged.total,
              parse_confidence: null,
            });
            return { ...merged, status, ...editMarker(r, update, new Date(), STAFF_USER) } as Receipt;
          })
        );
        return json({ ok: true, status });
      }

      // Originals: the forwarded email or the attached PDF.
      m = /^\/api\/receipts\/([^/]+)\/original$/.exec(path);
      if (m) {
        const id = m[1];
        const r = state.current.receipts.find((x) => x.id === id);
        if (EML[id]) {
          return json({
            url: "about:blank",
            kind: "eml",
            filename: `original-${id}.eml`,
            preview: { type: "eml", from: EML[id].from, to: "receipts+hb7q2k@in.unreceipt.com", subject: EML[id].subject, date: formatDate(r?.created_at ?? null), text: EML[id].text },
          });
        }
        if (PDF[id]) {
          if (!pdfUrls.has(id)) pdfUrls.set(id, makePdf(PDF[id]));
          return json({ url: pdfUrls.get(id), kind: "application/pdf", filename: `original-${id}.pdf` });
        }
        return json({ error: "no_original" }, 404);
      }

      // Firm members.
      if (path === "/api/firm/members" && method === "POST") {
        const email = String(body.email ?? "").trim().toLowerCase();
        setMembers((prev) => [...prev, { id: `m-${Date.now()}`, email, role: body.role === "admin" ? "admin" : "staff", claimed: false }]);
        return json({ ok: true }, 201);
      }
      m = /^\/api\/firm\/members\/([^/]+)$/.exec(path);
      if (m && method === "DELETE") {
        const id = m[1];
        setMembers((prev) => prev.filter((x) => x.id !== id));
        return json({ ok: true });
      }

      if (path.startsWith("/api/") && !path.startsWith("/api/merchant-logo/")) {
        return json({ error: "not in the demo" }, 404);
      }
      return realFetch(input, init);
    };

    // The PDF download is a plain link to the server; say so instead of
    // failing on a sign-in page.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (a && /\/api\/receipts\/[^/]+\/pdf$/.test(a.getAttribute("href") ?? "")) {
        e.preventDefault();
        setNotice("In the real portal this downloads the receipt's PDF. The demo has no server, so it stops here.");
      }
    };
    document.addEventListener("click", onClick, true);
    return () => {
      window.fetch = realFetch;
      document.removeEventListener("click", onClick, true);
      for (const u of pdfUrls.values()) URL.revokeObjectURL(u);
    };
  }, []);

  const month = resolveMonth(params.month ?? undefined);
  const active = clients.filter((c) => c.status === "active");
  const pending: PendingInvite[] = clients
    .filter((c) => c.status === "invited")
    .map((c) => ({ id: c.id, client_name: c.client_name, invited_email: c.invited_email, invite_expires_at: c.invite_expires_at, created_at: c.created_at, expired: false }));
  const stats = useMemo(
    () => computeClientStats(receipts as unknown as StatRow[], month),
    [receipts, month]
  );

  const banner = notice ? (
    <div className="bg-[var(--attention-tint)] text-[var(--attention-deep)]" role="status">
      <div className="max-w-[1040px] mx-auto px-4 py-2" style={{ fontSize: "13px" }}>
        {notice}{" "}
        <button type="button" className="underline min-h-11 px-2" onClick={() => setNotice(null)}>
          OK
        </button>
      </div>
    </div>
  ) : null;

  const navLink = (label: string, view: DemoParams["view"]) => {
    const isActive = params.view === view || (view === "clients" && params.view === "client");
    return (
      <Link
        key={view}
        href={hrefFor({ view })}
        aria-current={isActive ? "page" : undefined}
        className={
          "inline-flex items-center px-3 rounded-[10px] border-b-2 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
          (isActive ? "border-[var(--ink)] text-[var(--ink)]" : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]")
        }
        style={{ height: "44px", fontSize: "14px", fontWeight: 600 }}
      >
        {label}
      </Link>
    );
  };

  let content: React.ReactNode;
  const openClient = params.view === "client" ? active.find((c) => c.organization_id === params.org) : undefined;
  if (params.view === "settings") {
    content = <SettingsView firmName={FIRM} email={ME.email} role="admin" members={members} selfId={ME.id} />;
  } else if (openClient) {
    content = (
      <ClientView
        key={`${screenKey}:${openClient.organization_id}`}
        clientName={openClient.client_name}
        organizationId={openClient.organization_id}
        month={month}
        receipts={receipts
          .filter((r) => r.organization_id === openClient.organization_id && receiptMonth(r) === month)
          .sort((a, b) => (b.purchased_at ?? b.created_at).localeCompare(a.purchased_at ?? a.created_at))}
        reminders={{
          weekly: !weeklyOff.has(openClient.organization_id),
          clientOptedOut: false,
          lastSentAt: openClient.organization_id === ORG_HB ? inMonth(2) : null,
        }}
        bank={buildBankMonth(
          bankLines.filter((l) => l.organization_id === openClient.organization_id),
          receipts.filter((r) => r.organization_id === openClient.organization_id),
          month
        )}
        hrefs={{
          back: hrefFor({ month }),
          month: (mm) => hrefFor({ view: "client", org: openClient.organization_id, month: mm }),
        }}
      />
    );
  } else {
    content = (
      <ClientsView
        active={active}
        pending={pending}
        stats={stats}
        month={month}
        hrefs={{
          month: (mm) => hrefFor({ month: mm }),
          client: (orgId, mm) => hrefFor({ view: "client", org: orgId, month: mm }),
        }}
      />
    );
  }

  return (
    <>
      {banner}
      <FirmShell
        firmName={FIRM}
        homeHref={hrefFor({})}
        nav={<nav className="ml-auto flex items-center gap-1" aria-label="Firm" data-path={pathname}>{navLink("Clients", "clients")}{navLink("Settings", "settings")}</nav>}
      >
        {content}
      </FirmShell>
    </>
  );
}
