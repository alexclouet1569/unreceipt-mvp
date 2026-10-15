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
    "Swedish bookkeeping law requires your company to keep its receipts for seven years. Download them before that date: in Settings, choose Export for your accountant → All receipts. You get a ZIP with every receipt as a PDF, the original photos and emails, and a spreadsheet.";
  const stay = "Want to keep using UnReceipt instead? Choose a plan and nothing is deleted.";

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

// First word of the name the user typed at sign-up; nothing for magic-link
// users who never gave one.
export function firstNameFrom(fullName: string | null | undefined): string | null {
  if (typeof fullName !== "string") return null;
  const first = fullName.trim().split(/\s+/)[0];
  return first && first.length <= 40 ? first : null;
}
