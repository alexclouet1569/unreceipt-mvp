// Transactional email templates. Each returns subject + HTML + plain text
// (the text part matters for deliverability and for people who read mail
// as text).
//
// HTML is table-based with inline styles — the only layout that survives
// Gmail, Outlook and Apple Mail alike. Colors are the DESIGN.md tokens;
// fonts fall back to the system stack because mail clients won't load
// Manrope. The wordmark is live text (not an image) so it shows even when
// images are blocked.

export type EmailContent = { subject: string; html: string; text: string };

const C = {
  surface: "#FAFAF7",
  card: "#FFFFFF",
  ink: "#303568",
  inkMuted: "#5A5F7A",
  inkFaint: "#9CA0B8",
  hairline: "#E8E5DD",
  brand: "#27BE7B",
  brandTint: "#ECF7E7",
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.inkMuted};">${html}</p>`;
}

function button(label: string, href: string): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr>
    <td style="border-radius:10px;background:${C.ink};">
      <a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;">${esc(label)}</a>
    </td>
  </tr>
</table>`;
}

function step(n: number, title: string, bodyHtml: string): string {
  return `
<tr>
  <td valign="top" width="40" style="padding:0 0 18px;">
    <div style="width:28px;height:28px;border-radius:14px;background:${C.brandTint};color:${C.brand};font-family:${FONT};font-size:14px;font-weight:700;line-height:28px;text-align:center;">${n}</div>
  </td>
  <td valign="top" style="padding:3px 0 18px;">
    <p style="margin:0 0 4px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.ink};">${esc(title)}</p>
    <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.55;color:${C.inkMuted};">${bodyHtml}</p>
  </td>
</tr>`;
}

function layout(opts: { preheader: string; bodyHtml: string; footerHtml: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>UnReceipt</title>
</head>
<body style="margin:0;padding:0;background:${C.surface};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.surface};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td style="padding:0 4px 20px;font-family:${FONT};font-size:24px;font-weight:800;letter-spacing:-0.02em;">
            <span style="color:${C.ink};">Un</span><span style="color:${C.brand};">Receipt</span>
          </td>
        </tr>
        <tr>
          <td style="background:${C.card};border:1px solid ${C.hairline};border-radius:16px;padding:32px 28px;">
            ${opts.bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.inkFaint};">
            ${opts.footerHtml}
            <br>UnReceipt &middot; Paper is Past
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function signOff(canReply: boolean): { html: string; text: string } {
  const replyLine = "Questions, or something not working? Just reply to this email — it comes straight to me.";
  return {
    html:
      (canReply ? paragraph(esc(replyLine)) : "") +
      `<p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.5;color:${C.ink};">Alexandre<br><span style="color:${C.inkFaint};font-size:13px;">Founder, UnReceipt</span></p>`,
    text: `${canReply ? `${replyLine}\n\n` : ""}Alexandre\nFounder, UnReceipt`,
  };
}

// ---------------------------------------------------------------------------
// Waitlist — "Notify me" on the landing page (people outside Sweden)
// ---------------------------------------------------------------------------

export function waitlistEmail(opts: {
  joinUrl: string;
  pilotMode: boolean;
  canReply: boolean;
}): EmailContent {
  const joinLabel = opts.pilotMode ? "Join the free pilot" : "Start your free week";
  const sign = signOff(opts.canReply);

  const bodyHtml = [
    `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:1.3;color:${C.ink};">Thanks — you're on the list</h1>`,
    paragraph(
      "We saw that you'd like to hear when UnReceipt opens in your country. You're on the list, and we'll email you <strong>once</strong>, when it does. No newsletter."
    ),
    paragraph(
      "UnReceipt turns the receipts you'd normally lose into clean, VAT-ready records your accountant can use. We're running it with small businesses in Sweden first."
    ),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.brandTint};border-radius:12px;margin:8px 0 24px;">
      <tr><td style="padding:18px 20px 2px;">
        <p style="margin:0 0 4px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.ink};">Based in Sweden?</p>
        <p style="margin:0 0 12px;font-family:${FONT};font-size:14px;line-height:1.55;color:${C.inkMuted};">You don't need to wait — you can start today.</p>
        ${button(joinLabel, opts.joinUrl)}
      </td></tr>
    </table>`,
    sign.html,
  ].join("\n");

  return {
    subject: "You're on the UnReceipt list",
    html: layout({
      preheader: "We'll email you once, when UnReceipt opens in your country.",
      bodyHtml,
      footerHtml:
        "You're receiving this because this address was entered on unreceipt.com. If that wasn't you, ignore this email — you won't hear from us again.",
    }),
    text: [
      "Thanks — you're on the list",
      "",
      "We saw that you'd like to hear when UnReceipt opens in your country. You're on the list, and we'll email you once, when it does. No newsletter.",
      "",
      "UnReceipt turns the receipts you'd normally lose into clean, VAT-ready records your accountant can use. We're running it with small businesses in Sweden first.",
      "",
      `Based in Sweden? You don't need to wait — ${joinLabel.toLowerCase()}: ${opts.joinUrl}`,
      "",
      sign.text,
      "",
      "—",
      "You're receiving this because this address was entered on unreceipt.com. If that wasn't you, ignore this email.",
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Pilot welcome — sent once, right after the account is confirmed
// ---------------------------------------------------------------------------

export function pilotWelcomeEmail(opts: {
  firstName: string | null;
  appUrl: string;
  forwardingAddress: string | null;
  pilotMode: boolean;
  canReply: boolean;
}): EmailContent {
  const hey = opts.firstName ? `Hey ${opts.firstName}` : "Hey there";
  const joined = opts.pilotMode
    ? "We saw that you've just joined the UnReceipt pilot — thank you for trying it this early."
    : "We saw that you've just created your UnReceipt account — thank you for trying it.";
  const sign = signOff(opts.canReply);

  type Step = { title: string; html: string; text: string };
  const steps: Step[] = [
    {
      title: "Snap or upload a receipt",
      html: "Open UnReceipt and tap <strong>+</strong>. Take a photo of a paper receipt or upload a PDF. We read the shop, date, total and VAT for you — you check it and save.",
      text: "Open UnReceipt and tap +. Take a photo of a paper receipt or upload a PDF. We read the shop, date, total and VAT for you — you check it and save.",
    },
  ];
  if (opts.forwardingAddress) {
    steps.push({
      title: "Forward email receipts",
      html: `Send any email receipt to your own address: <strong style="color:${C.ink};">${esc(opts.forwardingAddress)}</strong>. Save it as a contact so it's one tap away.`,
      text: `Send any email receipt to your own address: ${opts.forwardingAddress}. Save it as a contact so it's one tap away.`,
    });
  }
  steps.push({
    title: "Hand it to your accountant",
    html: "Every complete receipt downloads as a clean PDF with the VAT broken out.",
    text: "Every complete receipt downloads as a clean PDF with the VAT broken out.",
  });

  const pilotNote = opts.pilotMode
    ? "The pilot is free. If that ever changes, we'll tell you well in advance — nothing is charged unless you choose a plan."
    : null;

  const bodyHtml = [
    `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:1.3;color:${C.ink};">${esc(hey)}, welcome aboard</h1>`,
    paragraph(`${esc(joined)} Here's how to get your first receipt in:`),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px;">${steps
      .map((s, i) => step(i + 1, s.title, s.html))
      .join("")}</table>`,
    button("Open UnReceipt", opts.appUrl),
    paragraph(
      `<span style="font-size:14px;">Tip: on your phone, open UnReceipt in the browser and choose <em>Add to Home Screen</em> — it then opens like an app.</span>`
    ),
    pilotNote ? paragraph(`<span style="font-size:14px;">${esc(pilotNote)}</span>`) : "",
    sign.html,
  ].join("\n");

  return {
    subject: opts.pilotMode ? "Welcome to the UnReceipt pilot" : "Welcome to UnReceipt",
    html: layout({
      preheader: "Here's how to get your first receipt in — it takes under a minute.",
      bodyHtml,
      footerHtml: "You're receiving this because you just created an UnReceipt account.",
    }),
    text: [
      `${hey}, welcome aboard`,
      "",
      `${joined} Here's how to get your first receipt in:`,
      "",
      ...steps.map((s, i) => `${i + 1}. ${s.title}\n   ${s.text}`),
      "",
      `Open UnReceipt: ${opts.appUrl}`,
      "",
      "Tip: on your phone, open UnReceipt in the browser and choose Add to Home Screen — it then opens like an app.",
      ...(pilotNote ? ["", pilotNote] : []),
      "",
      sign.text,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Retention reminder — ~14 days before a cancelled account is deleted
// (src/lib/retention.ts; privacy page "How long we keep it")
// ---------------------------------------------------------------------------

export function retentionReminderEmail(opts: {
  endedOn: string;
  deleteOn: string;
  settingsUrl: string;
  subscribeUrl: string;
  canReply: boolean;
}): EmailContent {
  const sign = signOff(opts.canReply);
  const intro = `Your UnReceipt subscription ended on ${opts.endedOn}. As promised in our privacy policy, we've kept your account and receipts for 90 days after cancellation so you can download them.`;
  const warning = `On ${opts.deleteOn} we will permanently delete your account, every receipt and every original file. This can't be undone.`;
  const duty =
    "Swedish bookkeeping law requires your company to keep its receipts until the end of the seventh year after the financial year they belong to. Download them before that date: in Settings, choose Export for your accountant → All receipts (or one year at a time if you have more than 1,000). You get a ZIP with the original photos and emails, a PDF of every completed receipt, and a spreadsheet.";
  const stay = "Want to keep using UnReceipt instead? Choose a plan before that date and nothing is deleted.";

  const bodyHtml = [
    `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:1.3;color:${C.ink};">Your receipts will be deleted on ${esc(opts.deleteOn)}</h1>`,
    paragraph(esc(intro)),
    paragraph(`<strong style="color:${C.ink};">${esc(warning)}</strong>`),
    paragraph(esc(duty)),
    button("Download your receipts", opts.settingsUrl),
    paragraph(
      `${esc(stay)} <a href="${esc(opts.subscribeUrl)}" style="color:${C.ink};">Choose a plan</a>`,
    ),
    sign.html,
  ].join("\n");

  return {
    subject: `Your UnReceipt receipts will be deleted on ${opts.deleteOn}`,
    html: layout({
      preheader: `Download your receipts before ${opts.deleteOn}.`,
      bodyHtml,
      footerHtml:
        "You're receiving this because your UnReceipt subscription ended. It's the only reminder we send before deletion.",
    }),
    text: [
      `Your receipts will be deleted on ${opts.deleteOn}`,
      "",
      intro,
      "",
      warning,
      "",
      duty,
      "",
      `Download your receipts: ${opts.settingsUrl}`,
      "",
      `${stay} ${opts.subscribeUrl}`,
      "",
      sign.text,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Forwarding setup link — "Email me this page" in the setup wizard, for
// someone who opened it on a phone (Gmail/Outlook rules need a computer)
// ---------------------------------------------------------------------------

export function forwardingSetupEmail(opts: { url: string }): EmailContent {
  const intro =
    "Here's the link to set up automatic forwarding. Open it on a computer: Gmail and Outlook only let you create forwarding rules in a browser. It takes about 3 minutes, and after that your email receipts arrive in UnReceipt by themselves.";
  const bodyHtml = [
    `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:1.3;color:${C.ink};">Finish setting up forwarding</h1>`,
    paragraph(esc(intro)),
    button("Open the setup", opts.url),
  ].join("\n");
  return {
    subject: "Your UnReceipt forwarding setup link",
    html: layout({
      preheader: "Open it on a computer: about 3 minutes.",
      bodyHtml,
      footerHtml: "You're receiving this because you asked for the link in UnReceipt.",
    }),
    text: ["Finish setting up forwarding", "", intro, "", `Open the setup: ${opts.url}`].join("\n"),
  };
}

// First word of the name the user typed at sign-up; nothing for magic-link
// users who never gave one.
export function firstNameFrom(fullName: string | null | undefined): string | null {
  if (typeof fullName !== "string") return null;
  const first = fullName.trim().split(/\s+/)[0];
  return first && first.length <= 40 ? first : null;
}

// ---------------------------------------------------------------------------
// Signup digest — nightly, to the founder only (src/lib/signup-digest.ts)
// ---------------------------------------------------------------------------

export type DigestSignup = {
  email: string;
  fullName: string | null;
  companyName: string | null;
  signedUpAt: Date;
  confirmed: boolean;
  provider: string;
  lastSignInAt: Date | null;
  onboarded: boolean;
  photoReceipts: number;
  emailReceipts: number;
  ownAddresses: number;
};

export type DigestWaitlistEntry = { email: string; source: string | null; signedUpAt: Date };

/** What happened in the app over the same 24 hours, admin accounts excluded. */
export type DigestActivity = {
  receiptsAdded: number;
  forwardedReceipts: number;
  receiptAdders: number;
  totalReceipts: number;
  reviewNeeded: number;
  signedIn: number;
  unconfirmedCharges: number;
  liveVersion: { title: string; sha: string | null } | null;
};

// Personal mailbox providers: their domain says nothing about the company.
const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.se", "outlook.com", "outlook.se",
  "live.com", "live.se", "msn.com", "icloud.com", "me.com", "mac.com", "yahoo.com", "yahoo.se",
  "protonmail.com", "proton.me", "pm.me", "aol.com", "gmx.com", "gmx.net", "mail.com",
  "telia.com", "bredband.net", "spray.se", "comhem.se", "hey.com", "hotmail.fr", "orange.fr",
  "free.fr", "laposte.net", "wanadoo.fr", "sfr.fr", "yahoo.fr",
]);

/** The company website a work address points to, or null for a personal mailbox. */
export function companySiteFor(email: string): string | null {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain || !domain.includes(".") || FREEMAIL.has(domain)) return null;
  return `https://${domain}`;
}

function stockholm(d: Date): string {
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  });
}

function progressOf(s: DigestSignup): { line: string; activated: boolean } {
  const receipts = s.photoReceipts + s.emailReceipts;
  const parts = [
    s.confirmed ? "email confirmed" : "never confirmed their email",
    s.onboarded ? "finished onboarding" : "didn't finish onboarding",
    receipts === 0
      ? "no receipts yet"
      : `${receipts} receipt${receipts === 1 ? "" : "s"} (${s.photoReceipts} photo/upload, ${s.emailReceipts} forwarded)`,
  ];
  if (s.ownAddresses > 0) parts.push("added their own email address for forwarding");
  return { line: parts.join(" · "), activated: receipts > 0 };
}

/** A ready-to-send first message: feedback if they got a receipt in, otherwise what stopped them. */
export function signupOutreach(s: DigestSignup): { subject: string; body: string; href: string } {
  const first = firstNameFrom(s.fullName);
  const hi = first ? `Hi ${first},` : "Hi,";
  const { activated } = progressOf(s);
  const subject = activated ? "Your first receipts in UnReceipt" : "Quick question about UnReceipt";
  const opener = activated
    ? "Thanks for joining the UnReceipt pilot, and for already putting receipts in. I'm the founder, and at this stage every bit of feedback shapes what I build next."
    : "Thanks for joining the UnReceipt pilot. I'm the founder, and I noticed you haven't added a receipt yet. Did something get in the way? Even a one-line answer helps me a lot.";
  const body = [
    hi,
    "",
    opener,
    "",
    "Could I ask you three quick questions (by reply, or a 10-minute call this week if that's easier)?",
    "1. How do you handle receipts today: an app, paper in a folder, or your accountant?",
    "2. Roughly how many receipts a month, and how many people in the company pay for things?",
    "3. Which accounting tool does the company use (Fortnox, Visma, Pennylane, something else)?",
    "",
    "Thank you!",
    "Alexandre",
    "Founder, UnReceipt",
  ].join("\n");
  const href = `mailto:${encodeURIComponent(s.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { subject, body, href };
}

// Anyone can sign up with someone else's address; don't offer to write to
// it until the owner has confirmed it's theirs.
const UNCONFIRMED_NOTE = "Not confirmed yet: the address may not be theirs, so wait before writing.";

const INTERVIEW_QUESTIONS = [
  "What made you sign up today? What were you trying to fix?",
  "How do receipts get from your pocket or inbox to the accountant today, and who does it?",
  "How many receipts a month, and how many people in the company spend money?",
  "Which accounting tool, and do you work with an accountant?",
  "What would make you stop using UnReceipt? What would make you pay for it?",
];

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function activityRows(a: DigestActivity): [string, string][] {
  const photo = a.receiptsAdded - a.forwardedReceipts;
  const rows: [string, string][] = [
    [
      "Receipts added",
      a.receiptsAdded === 0
        ? "none"
        : `${a.receiptsAdded} (${photo} photo/upload, ${a.forwardedReceipts} forwarded) by ${a.receiptAdders} ${a.receiptAdders === 1 ? "person" : "people"}`,
    ],
    ["Signed in", plural(a.signedIn, "account")],
    ["Waiting in Review needed", `${a.reviewNeeded} (all accounts, all time)`],
    ["Receipts in total", String(a.totalReceipts)],
  ];
  if (a.unconfirmedCharges > 0) {
    rows.push([
      "Needs a look",
      `${plural(a.unconfirmedCharges, "extra-receipt charge")} sent to Stripe but never confirmed, past the automatic retry (all time). Check Sentry and the Stripe meter.`,
    ]);
  }
  if (a.liveVersion) {
    rows.push(["Live version", `${a.liveVersion.title}${a.liveVersion.sha ? ` (${a.liveVersion.sha})` : ""}`]);
  }
  return rows;
}

export function signupDigestEmail(opts: {
  signups: DigestSignup[];
  moreSignups: number;
  waitlist: DigestWaitlistEntry[];
  totalAccounts: number;
  activity: DigestActivity;
}): EmailContent {
  const accounts = opts.signups.length + opts.moreSignups;
  const counts =
    [
      accounts > 0 ? plural(accounts, "new account") : null,
      opts.waitlist.length > 0 ? plural(opts.waitlist.length, "waitlist sign-up") : null,
    ].filter(Boolean).join(" and ") || "No new sign-ups";
  const added = opts.activity.receiptsAdded;
  const subject = `UnReceipt: ${counts} in the last 24 hours · ${added === 0 ? "no receipts added" : `${plural(added, "receipt")} added`}`;
  const rows = activityRows(opts.activity);

  const signupHtml = opts.signups.map((s) => {
    const name = [s.fullName, s.companyName].filter(Boolean).join(" · ") || s.email;
    const site = companySiteFor(s.email);
    const { line } = progressOf(s);
    const out = signupOutreach(s);
    return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.hairline};border-radius:12px;margin:0 0 14px;">
  <tr><td style="padding:16px 18px;">
    <p style="margin:0 0 4px;font-family:${FONT};font-size:16px;font-weight:700;color:${C.ink};">${esc(name)}</p>
    <p style="margin:0 0 8px;font-family:${FONT};font-size:14px;line-height:1.5;color:${C.inkMuted};">
      <a href="mailto:${esc(encodeURIComponent(s.email))}" style="color:${C.ink};">${esc(s.email)}</a>${site ? ` · <a href="${esc(site)}" style="color:${C.ink};">${esc(site.replace("https://", ""))}</a>` : ""}<br>
      Signed up ${esc(stockholm(s.signedUpAt))} via ${esc(s.provider)}${s.lastSignInAt ? ` · last seen ${esc(stockholm(s.lastSignInAt))}` : ""}
    </p>
    <p style="margin:0 0 12px;font-family:${FONT};font-size:14px;line-height:1.5;color:${C.inkMuted};">${esc(line)}</p>
    ${s.confirmed
      ? `<a href="${esc(out.href)}" style="font-family:${FONT};font-size:14px;font-weight:600;color:${C.brand};">Write to them (message pre-filled) →</a>`
      : `<span style="font-family:${FONT};font-size:14px;color:${C.inkFaint};">${esc(UNCONFIRMED_NOTE)}</span>`}
  </td></tr>
</table>`;
  }).join("");

  const waitlistHtml = opts.waitlist.length
    ? `<p style="margin:20px 0 8px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.ink};">Waitlist</p>` +
      opts.waitlist
        .map((w) =>
          paragraph(
            `<a href="mailto:${esc(encodeURIComponent(w.email))}" style="color:${C.ink};">${esc(w.email)}</a> · ${esc(stockholm(w.signedUpAt))}${w.source ? ` · ${esc(w.source)}` : ""}`,
          ),
        )
        .join("")
    : "";

  const questionsHtml = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.brandTint};border-radius:12px;margin:20px 0 0;">
  <tr><td style="padding:16px 20px;">
    <p style="margin:0 0 8px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.ink};">If you get them on a call</p>
    <ol style="margin:0;padding-left:20px;font-family:${FONT};font-size:14px;line-height:1.6;color:${C.inkMuted};">${INTERVIEW_QUESTIONS.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>
  </td></tr>
</table>`;

  const more = opts.moreSignups > 0 ? paragraph(esc(`…and ${opts.moreSignups} more, see /admin.`)) : "";

  const activityHtml = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.hairline};border-radius:12px;margin:0 0 20px;">
  <tr><td style="padding:14px 18px 6px;">
    <p style="margin:0 0 8px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.ink};">In the app, last 24 hours</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows
      .map(
        ([label, value]) => `
      <tr>
        <td valign="top" width="42%" style="padding:0 12px 8px 0;font-family:${FONT};font-size:14px;line-height:1.5;color:${C.inkFaint};">${esc(label)}</td>
        <td valign="top" style="padding:0 0 8px;font-family:${FONT};font-size:14px;line-height:1.5;color:${C.ink};">${esc(value)}</td>
      </tr>`,
      )
      .join("")}
    </table>
  </td></tr>
</table>`;

  const bodyHtml = [
    `<h1 style="margin:0 0 6px;font-family:${FONT};font-size:22px;line-height:1.3;color:${C.ink};">${esc(counts)}</h1>`,
    paragraph(esc(`${opts.totalAccounts} accounts in total (your admin accounts excluded).`)),
    activityHtml,
    signupHtml,
    more,
    waitlistHtml,
    opts.signups.length ? questionsHtml : "",
  ].join("\n");

  const text = [
    counts,
    `${opts.totalAccounts} accounts in total (your admin accounts excluded).`,
    "",
    "In the app, last 24 hours:",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    ...opts.signups.flatMap((s) => {
      const site = companySiteFor(s.email);
      return [
        [s.fullName, s.companyName].filter(Boolean).join(" · ") || s.email,
        `${s.email}${site ? ` · ${site}` : ""}`,
        `Signed up ${stockholm(s.signedUpAt)} via ${s.provider}${s.lastSignInAt ? ` · last seen ${stockholm(s.lastSignInAt)}` : ""}`,
        progressOf(s).line,
        ...(s.confirmed ? [] : [UNCONFIRMED_NOTE]),
        "",
      ];
    }),
    ...(opts.moreSignups > 0 ? [`…and ${opts.moreSignups} more, see /admin.`, ""] : []),
    ...(opts.waitlist.length
      ? ["Waitlist:", ...opts.waitlist.map((w) => `${w.email} · ${stockholm(w.signedUpAt)}${w.source ? ` · ${w.source}` : ""}`), ""]
      : []),
    ...(opts.signups.length ? ["If you get them on a call:", ...INTERVIEW_QUESTIONS.map((q, i) => `${i + 1}. ${q}`)] : []),
  ].join("\n");

  return {
    subject,
    html: layout({
      preheader: opts.signups.length
        ? "Reach out while they still remember signing up."
        : "Your nightly UnReceipt update.",
      bodyHtml,
      footerHtml: "Sent every night, also when nobody signed up. Only you receive this.",
    }),
    text,
  };
}
