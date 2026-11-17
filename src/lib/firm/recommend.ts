// "Rekommendera UnReceipt till klienter" (/firm/clients and the iPhone
// app's firm link screen): a ready Swedish email an accountant copies and
// sends to their clients, with the firm's join link (join-link.ts) and the
// client quick-start guide. Pure, client-safe.
//
// Kept true to the product: nothing is shared before the client presses
// Yes, share; the firm then sees the company's receipts, except those read
// from a connected mailbox until confirmed (src/lib/firm/visibility.ts).
// No prices or "free": the text also goes out from the store app.
// The product is in English, so the button names stay English.

/** The client quick-start guide, served from public/ (docs/onboarding). */
export const CLIENT_GUIDE_PATH = "/guides/UnReceipt-Get-started-companies.pdf";

export type RecommendText = { subject: string; body: string };

export function recommendEmail(opts: { firmName: string; joinUrl: string; guideUrl: string }): RecommendText {
  const firm = opts.firmName.trim();
  return {
    subject: "Så skickar du kvitton till oss med UnReceipt",
    body: [
      "Hej!",
      "",
      `${firm ? `Vi på ${firm}` : "Vi"} tar emot kvitton från våra klienter med UnReceipt. Du fotograferar papperskvitton med mobilen eller vidarebefordrar kvitton som kommer med e-post, och UnReceipt läser av butik, belopp, moms och datum åt dig. Då slipper vi leta kvitton vid månadsskiftet.`,
      "",
      "Så kommer du igång (cirka 2 minuter). UnReceipt är på engelska, så knapparna har engelska namn:",
      `1. Öppna vår länk: ${opts.joinUrl}`,
      "2. Skapa ett konto med din e-postadress (har du redan ett konto, välj \"I already have an account\").",
      "3. Tryck på \"Yes, share\" för att dela företagets kvitton med oss.",
      "",
      "Inget delas förrän du trycker på \"Yes, share\". Kvitton som UnReceipt läser från en ansluten Gmail eller Outlook ser vi först när du har bekräftat dem.",
      "",
      `En kort guide (på engelska): ${opts.guideUrl}`,
      "",
      "Hör av dig om du har frågor.",
      "",
      "Vänliga hälsningar",
      firm,
    ]
      .join("\n")
      .trimEnd(),
  };
}
