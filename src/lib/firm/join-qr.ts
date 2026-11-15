// SERVER-ONLY. The firm's join link as a QR code (a PNG data URL), drawn on
// the server so the firm's page needs no QR code library in the browser.
// Ink on white, like a printed document (#303568 is light-mode --ink: a PNG
// can't read CSS variables, DESIGN.md "Firm's join link"); error correction
// M survives a slightly smudged printout, and the standard 4-module white
// border keeps it readable pasted on a coloured website.

import QRCode from "qrcode";

export async function joinQrDataUrl(url: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 4,
      width: 480,
      color: { dark: "#303568", light: "#FFFFFF" },
    });
  } catch (err) {
    console.error("[join-qr] failed", err instanceof Error ? err.message : "error");
    return null;
  }
}
