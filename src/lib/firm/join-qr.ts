// SERVER-ONLY. The firm's join link as a QR code (a PNG data URL), drawn on
// the server so the firm's page needs no QR code library in the browser.
// Ink on white, like a printed document; error correction M survives a
// slightly smudged printout.

import QRCode from "qrcode";

export async function joinQrDataUrl(url: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 480,
      color: { dark: "#303568", light: "#FFFFFF" },
    });
  } catch (err) {
    console.error("[join-qr] failed", err instanceof Error ? err.message : "error");
    return null;
  }
}
