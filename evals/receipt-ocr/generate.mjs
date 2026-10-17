#!/usr/bin/env node
// Renders the synthetic receipts in receipts.mjs to JPEG photos and writes
// cases/synthetic.json (ground truth). Deterministic: re-running produces the
// same layouts (the "photo" jitter is seeded by the case id).
//
//   node evals/receipt-ocr/generate.mjs
//
// Uses the Playwright Chromium that ships with the e2e tests.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { NEGATIVES, RECEIPTS, expectedFor, vatTable } from "./receipts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "cases");
const IMG = join(OUT, "images");
// Same ceiling as the capture dialog's in-browser resize (src/lib/image-resize.ts).
const MAX_EDGE = 2000;

// ── formatting ────────────────────────────────────────────────────────────

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function money(n, locale) {
  const neg = n < 0;
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  const sep = locale.startsWith("en") ? "," : " ";
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const s = locale.startsWith("en") ? `${grouped}.${dec}` : `${grouped},${dec}`;
  return neg ? `-${s}` : s;
}

const num = (n, locale, digits = 2) =>
  locale.startsWith("en") ? n.toFixed(digits) : n.toFixed(digits).replace(".", ",");

function dateText(r) {
  const [y, m, d] = r.date.split("-");
  if (r.dateFormat === "dd.mm.yy") return `${d}.${m}.${y.slice(2)} ${r.time}`;
  if (r.locale === "sv") return `${r.date} ${r.time}`;
  if (r.locale === "fr") return `${d}/${m}/${y} ${r.time}`;
  if (r.locale === "en-US") {
    const [hh, mm] = r.time.split(":").map(Number);
    return `${m}/${d}/${y} ${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
  }
  return `${d}/${m}/${y} ${r.time}`;
}

const L = {
  sv: { total: "TOTALT", sum: "Summa", vat: "Moms", rate: "Moms%", net: "Netto", gross: "Brutto", tip: "Dricks", cash: "Kontant", change: "Växel", rounding: "Öresavrundning", pay: "ATT BETALA", thanks: "Tack för besöket!", receipt: "KVITTO", cur: "SEK" },
  fr: { total: "TOTAL TTC", sum: "Sous-total", vat: "TVA", rate: "Taux", net: "HT", gross: "TTC", tip: "Pourboire", cash: "Espèces", change: "Rendu", rounding: "Arrondi", pay: "À PAYER", thanks: "Merci de votre visite", receipt: "TICKET", cur: "EUR" },
  "en-US": { total: "TOTAL", sum: "Subtotal", vat: "Tax", rate: "Rate", net: "Net", gross: "Gross", tip: "Tip", cash: "Cash", change: "Change", rounding: "Rounding", pay: "TOTAL DUE", thanks: "Thank you!", receipt: "RECEIPT", cur: "USD" },
  "en-GB": { total: "TOTAL", sum: "Subtotal", vat: "VAT", rate: "VAT%", net: "Net", gross: "Gross", tip: "Service", cash: "Cash", change: "Change", rounding: "Rounding", pay: "TOTAL DUE", thanks: "Thank you for visiting", receipt: "RECEIPT", cur: "GBP" },
};

const row = (left, right, cls = "") => `<div class="row ${cls}"><span>${esc(left)}</span><span>${esc(right)}</span></div>`;

// ── receipt bodies ──────────────────────────────────────────────────────

function thermalBody(r) {
  const t = L[r.locale];
  const lc = r.locale;
  const exp = expectedFor(r);
  const parts = [];
  parts.push(`<div class="center big">${esc(r.merchant.name)}</div>`);
  for (const l of r.merchant.lines) parts.push(`<div class="center">${esc(l)}</div>`);
  parts.push(`<div class="center">${esc(dateText(r))}</div>`, `<div class="rule"></div>`);
  for (const it of r.items) {
    parts.push(row(it.label, money(it.total, lc)));
    if (it.qty != null) {
      const unitLabel = r.unitSuffix ? `${num(it.qty, lc)} ${r.unitSuffix}` : `${it.qty} st`;
      parts.push(`<div class="sub">${esc(unitLabel)} x ${esc(num(it.unit, lc, r.unitSuffix ? 3 : 2))}</div>`);
    }
  }
  for (const d of r.discounts ?? []) parts.push(row(d.label, money(d.amount, lc)));
  parts.push(`<div class="rule"></div>`);
  const goods = r.items.reduce((s, i) => s + i.total, 0) + (r.discounts ?? []).reduce((s, d) => s + d.amount, 0);
  if (r.taxAddedOnTop) {
    parts.push(row(t.sum, money(goods, lc)));
    parts.push(row(`${t.vat} ${r.taxAddedOnTop}%`, money(exp.tax_amount, lc)));
    if (r.tip) parts.push(row(t.tip, money(r.tip, lc)));
    parts.push(row(t.total, `$${money(exp.amount, lc)}`, "big"));
  } else if (r.tip) {
    parts.push(row(t.sum, money(goods, lc)));
    parts.push(row(t.tip, money(r.tip, lc)));
    parts.push(row(`${t.total} ${t.cur}`, money(exp.amount, lc), "big"));
  } else if (r.cashRounding) {
    parts.push(row(t.sum, money(goods, lc)));
    parts.push(row(t.rounding, money(exp.amount - goods, lc)));
    parts.push(row(t.pay, money(exp.amount, lc), "big"));
    parts.push(row(t.cash, money(r.payment.cashGiven, lc)));
    parts.push(row(t.change, money(r.payment.cashGiven - exp.amount, lc)));
  } else {
    parts.push(row(`${t.total} ${t.cur}`, money(exp.amount, lc), "big"));
  }
  if (r.payment.method === "card") {
    parts.push(row(r.payment.label, money(exp.amount, lc)));
    if (r.payment.card) parts.push(`<div class="sub">${esc(r.payment.card)}</div>`);
  }
  if (!r.taxAddedOnTop) {
    parts.push(`<div class="rule"></div>`);
    parts.push(`<div class="row vat"><span>${t.rate}</span><span>${t.vat}</span><span>${t.net}</span><span>${t.gross}</span></div>`);
    for (const b of vatTable(r)) {
      parts.push(`<div class="row vat"><span>${num(b.rate, lc, b.rate % 1 ? 1 : 0)}</span><span>${money(b.vat, lc)}</span><span>${money(b.net, lc)}</span><span>${money(b.gross, lc)}</span></div>`);
    }
  }
  parts.push(`<div class="rule"></div>`, `<div class="center">${esc(t.thanks)}</div>`);
  parts.push(`<div class="center small">${t.receipt} ${(hash(r.id) % 90000) + 10000}</div>`);
  return `<div class="paper thermal">${parts.join("")}</div>`;
}

function terminalBody(r) {
  const lc = r.locale;
  const exp = expectedFor(r);
  return `<div class="paper thermal slipw">
    <div class="center big">${esc(r.merchant.name)}</div>
    ${r.merchant.lines.map((l) => `<div class="center">${esc(l)}</div>`).join("")}
    <div class="rule"></div>
    ${row("Term-ID", "7731 0042")}${row("Butiksnr", "418822")}
    <div class="center">${esc(dateText(r))}</div>
    <div class="center">VISA CONTACTLESS</div>
    <div class="center">************5519</div>
    <div class="rule"></div>
    ${row("KÖP", `${money(exp.amount, lc)} SEK`, "big")}
    ${row(`varav moms ${r.terminalVat.rate}%`, money(exp.tax_amount, lc))}
    <div class="rule"></div>
    <div class="center">GODKÄND</div>
    <div class="center small">Ref 004417 AID A0000000031010</div>
    <div class="center small">SPARA KVITTOT</div>
  </div>`;
}

function slipBody(r) {
  // Narrow ticket printer: meter / parking machine.
  const t = L[r.locale];
  const lc = r.locale;
  const exp = expectedFor(r);
  const b = vatTable(r)[0];
  return `<div class="paper thermal slipw">
    <div class="center big">${esc(r.merchant.name)}</div>
    ${r.merchant.lines.map((l) => `<div class="center">${esc(l)}</div>`).join("")}
    <div class="center">${esc(dateText(r))}</div>
    <div class="rule"></div>
    ${r.items.map((i) => `<div>${esc(i.label)}</div>`).join("")}
    ${row(`${t.total}`, `${money(exp.amount, lc)} kr`, "big")}
    ${row(`${t.vat} ${b.rate}%`, money(b.vat, lc))}
    ${row(t.net, money(b.net, lc))}
    ${row("Betalt", r.payment.label)}
    <div class="rule"></div>
    <div class="center small">${esc(t.thanks)}</div>
  </div>`;
}

function digitalBody(r) {
  const t = L[r.locale];
  const lc = r.locale;
  const exp = expectedFor(r);
  const cur = r.currency === "EUR" ? "€" : r.currency === "SEK" ? "kr" : r.currency;
  const fmt = (n) => (r.currency === "EUR" && lc.startsWith("en") ? `€${money(n, lc)}` : `${money(n, lc)} ${cur}`);
  const rows = r.items
    .map((i) => `<tr><td>${esc(i.label)}${i.qty ? ` <span class="muted">× ${i.qty}</span>` : ""}</td><td class="r">${esc(fmt(i.total))}</td></tr>`)
    .join("");
  const vat = vatTable(r)
    .map((b) => `<tr class="muted"><td>${t.vat} ${num(b.rate, lc, 0)} %</td><td class="r">${esc(fmt(b.vat))}</td></tr>`)
    .join("");
  return `<div class="paper digital">
    <div class="brand">${esc(r.merchant.name)}</div>
    ${r.merchant.lines.map((l) => `<div class="muted">${esc(l)}</div>`).join("")}
    <div class="muted">${esc(dateText(r))}</div>
    <table>${rows}
      <tr class="tot"><td>${t.total}</td><td class="r">${esc(fmt(exp.amount))}</td></tr>
      ${vat}
      <tr class="muted"><td>${esc(r.payment.label)}</td><td class="r">${esc(fmt(exp.amount))}</td></tr>
    </table>
  </div>`;
}

function negativeBody(n) {
  switch (n.kind) {
    case "menu":
      return `<div class="paper menu"><div class="brand">Bistro Söder</div><div class="muted">MENY</div>
        <h3>Förrätter</h3>${row("Toast Skagen", "165 kr")}${row("Soppa dagens", "95 kr")}
        <h3>Varmrätter</h3>${row("Pannbiff med lök", "235 kr")}${row("Laxfilé, potatis", "265 kr")}${row("Vegetarisk risotto", "215 kr")}
        <h3>Dryck</h3>${row("Husets vin, glas", "125 kr")}${row("Öl 40cl", "89 kr")}
        <div class="muted small">Allergier? Fråga personalen.</div></div>`;
    case "business_card":
      return `<div class="paper card"><div class="brand">Anna Lindqvist</div><div>Redovisningskonsult</div><br>
        <div>Lindqvist Redovisning AB</div><div>Sveavägen 44, Stockholm</div><div>070-123 45 67</div><div>anna@lindqvistredovisning.se</div></div>`;
    case "shopping_list":
      return `<div class="paper list"><div class="hand">Handla lördag</div>
        ${["mjölk", "ägg x2", "bröd", "kaffe!!", "tvättmedel", "blommor till mamma ~150 kr"].map((x) => `<div class="hand">– ${x}</div>`).join("")}</div>`;
    case "flyer":
      return `<div class="paper flyer"><div class="burst">ERBJUDANDE!</div><div class="brand">Kaffe 2 för 79 kr</div>
        <div>Ord. pris 54,90 kr/st. Max 4 per hushåll.</div><div>Gäller v.42, 13–19 oktober 2026</div><div class="muted">ICA Kvantum Flygfyren</div></div>`;
    default:
      return `<div class="mug"></div><div class="pen"></div>`;
  }
}

// ── scenes (how the "photo" was taken) ───────────────────────────────────

function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
const jitter = (id, salt, lo, hi) => lo + ((hash(id + salt) % 1000) / 1000) * (hi - lo);

function scene(id, condition, body) {
  const rot = jitter(id, "rot", -6, 6).toFixed(2);
  const tilt = jitter(id, "tilt", 4, 14).toFixed(2);
  const light = jitter(id, "light", 0.08, 0.28).toFixed(2);
  const base = {
    scan: { bg: "#e9e9e6", transform: `rotate(${(rot / 6).toFixed(2)}deg)`, filter: "none", shade: 0 },
    digital: { bg: "#ffffff", transform: "none", filter: "none", shade: 0 },
    photo: { bg: "wood", transform: `perspective(1400px) rotateX(${tilt}deg) rotate(${rot}deg)`, filter: "blur(0.35px)", shade: light },
    faded: { bg: "wood", transform: `perspective(1400px) rotateX(${tilt / 2}deg) rotate(${rot / 2}deg)`, filter: "contrast(0.55) brightness(1.12) blur(0.3px)", shade: light },
    blurry: { bg: "wood", transform: `perspective(1400px) rotateX(${tilt}deg) rotate(${rot}deg)`, filter: "blur(1.7px)", shade: light },
    crumpled: { bg: "wood", transform: `perspective(1400px) rotateX(${tilt}deg) rotate(${rot}deg)`, filter: "url(#crumple) blur(0.3px)", shade: 0.3 },
    upside_down: { bg: "wood", transform: `perspective(1400px) rotateX(${tilt}deg) rotate(${180 + Number(rot)}deg)`, filter: "blur(0.35px)", shade: light },
  }[condition];
  const bg =
    base.bg === "wood"
      ? "background: repeating-linear-gradient(92deg, #8a5a33 0 9px, #96653b 9px 15px, #7d522e 15px 31px), #8a5a33;"
      : `background: ${base.bg};`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; }
    #scene { display: inline-block; padding: ${base.bg === "#ffffff" ? "24px" : "70px 60px"}; ${bg} position: relative; overflow: hidden; }
    #scene::after { content: ""; position: absolute; inset: 0; pointer-events: none;
      background: linear-gradient(115deg, rgba(255,255,255,${base.shade / 2}) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,${base.shade}) 100%); }
    .holder { transform: ${base.transform}; filter: ${base.filter}; transform-origin: 50% 50%; }
    .paper { background: #fbfbf8; color: #1d1d1d; box-shadow: 0 10px 24px rgba(0,0,0,.35); }
    .thermal { width: 380px; padding: 22px 18px 30px; font: 15px/1.38 "DejaVu Sans Mono", "Liberation Mono", monospace; }
    .slipw { width: 300px; }
    .faded .thermal, .faded-ink { color: #6b6b6b; }
    .row { display: flex; justify-content: space-between; gap: 10px; }
    .row.vat span { flex: 1; text-align: right; } .row.vat span:first-child { text-align: left; }
    .center { text-align: center; } .big { font-weight: 700; font-size: 17px; } .small { font-size: 12px; }
    .sub { padding-left: 14px; font-size: 13px; }
    .rule { border-top: 1px dashed #555; margin: 7px 0; }
    .digital { width: 560px; padding: 34px 36px; font: 16px/1.5 "DejaVu Sans", Arial, sans-serif; box-shadow: none; border: 1px solid #ddd; }
    .digital table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    .digital td { padding: 7px 0; border-bottom: 1px solid #eee; } .r { text-align: right; }
    .tot td { font-weight: 700; font-size: 19px; border-top: 2px solid #222; }
    .brand { font: 700 24px/1.3 "DejaVu Sans", sans-serif; margin-bottom: 6px; }
    .muted { color: #777; } h3 { margin: 14px 0 4px; font: 700 16px "DejaVu Serif", serif; }
    .menu { width: 420px; padding: 30px; font: 15px/1.6 "DejaVu Serif", serif; }
    .card { width: 420px; height: 240px; padding: 26px; font: 15px/1.5 "DejaVu Sans", sans-serif; }
    .list { width: 360px; padding: 24px 28px; background: repeating-linear-gradient(#fbfbf8 0 31px, #b9cce6 31px 32px); }
    .hand { font: italic 22px/32px "DejaVu Serif", cursive; color: #1b3a8a; }
    .flyer { width: 420px; padding: 30px; background: #ffe14d; font: 17px/1.5 "DejaVu Sans", sans-serif; }
    .burst { font: 900 34px "DejaVu Sans", sans-serif; color: #d01818; }
    .mug { width: 220px; height: 220px; border-radius: 50%; background: radial-gradient(circle, #3b2414 0 52%, #eee 53% 68%, #ccc 69%); box-shadow: 0 12px 30px rgba(0,0,0,.4); display: inline-block; margin: 60px; }
    .pen { width: 300px; height: 14px; background: #123; border-radius: 7px; transform: rotate(-24deg); margin: 0 0 80px 120px; }
  </style></head><body>
  <svg width="0" height="0" style="position:absolute"><filter id="crumple"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="${hash(id) % 97}"/><feDisplacementMap in="SourceGraphic" scale="16"/></filter></svg>
  <div id="scene" class="${condition === "faded" ? "faded" : ""}"><div class="holder">${body}</div></div></body></html>`;
}

// ── main ───────────────────────────────────────────────────────────────

async function render(browser, id, html) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  const box = await page.locator("#scene").boundingBox();
  await page.close();
  const dsf = Math.min(2.5, (MAX_EDGE - 8) / Math.max(box.width, box.height));
  const hi = await browser.newPage({ viewport: { width: Math.ceil(box.width) + 20, height: Math.ceil(box.height) + 20 }, deviceScaleFactor: dsf });
  await hi.setContent(html);
  const file = join(IMG, `${id}.jpg`);
  await hi.locator("#scene").screenshot({ path: file, type: "jpeg", quality: 78 });
  await hi.close();
  return `cases/images/${id}.jpg`;
}

async function main() {
  mkdirSync(IMG, { recursive: true });
  const browser = await chromium.launch(process.env.RECEIPT_EVAL_CHROMIUM ? { executablePath: process.env.RECEIPT_EVAL_CHROMIUM } : {});
  const cases = [];
  for (const r of RECEIPTS) {
    const body = r.style === "digital" ? digitalBody(r) : r.style === "terminal" ? terminalBody(r) : r.style === "slip" ? slipBody(r) : thermalBody(r);
    const image = await render(browser, r.id, scene(r.id, r.condition, body));
    cases.push({ id: r.id, tags: r.tags, image, media_type: "image/jpeg", source: "synthetic", expected: { not_a_receipt: false, ...expectedFor(r) } });
  }
  for (const n of NEGATIVES) {
    const image = await render(browser, n.id, scene(n.id, n.condition, negativeBody(n)));
    cases.push({ id: n.id, tags: n.tags, image, media_type: "image/jpeg", source: "synthetic", expected: { not_a_receipt: true } });
  }
  await browser.close();
  writeFileSync(join(OUT, "synthetic.json"), JSON.stringify(cases, null, 2) + "\n");
  console.log(`wrote ${cases.length} cases to ${join(OUT, "synthetic.json")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
