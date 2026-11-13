import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PDFDocument, PDFName, PDFDict } from "pdf-lib";

vi.mock("@/lib/image-resize", () => ({ prepareImageForUpload: async (f: File) => f }));

import { BatchCapture, expandFiles, splitPages } from "@/app/app/(authed)/BatchCapture";

async function pdfWithPages(n: number, opts: { attachment?: boolean } = {}): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([200, 300]);
  if (opts.attachment) {
    await doc.attach(Buffer.from("<Invoice/>").toString("base64"), "factur-x.xml", { mimeType: "application/xml" });
  }
  return new File([(await doc.save()) as BlobPart], "scan.pdf", { type: "application/pdf" });
}

const photo = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });

describe("expandFiles", () => {
  it("asks about a multi-page scan, keeps photos and one-page PDFs as they are", async () => {
    const out = await expandFiles([await pdfWithPages(3), await pdfWithPages(1), photo("a.jpg")]);
    expect(out.map((o) => ("choose" in o && o.choose !== undefined ? `choose ${o.choose}` : "error" in o ? "error" : o.mode.as))).toEqual([
      "choose 3",
      "file",
      "file",
    ]);
  });

  it("reads an e-invoice carrying files whole, never split", async () => {
    const pdf = await pdfWithPages(2, { attachment: true });
    const doc = await PDFDocument.load(new Uint8Array(await pdf.arrayBuffer()));
    expect(doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict)).toBeDefined();
    const [out] = await expandFiles([pdf]);
    expect("mode" in out && out.mode).toEqual({ as: "whole" });
  });

  it("reports a PDF that can't be opened instead of sending it", async () => {
    const out = await expandFiles([new File(["not a pdf"], "bad.pdf", { type: "application/pdf" })]);
    expect(out).toEqual([{ label: "bad.pdf", error: "This PDF couldn't be opened." }]);
  });
});

describe("splitPages", () => {
  it("makes one one-page PDF per page", async () => {
    const pages = await splitPages(await pdfWithPages(3));
    expect(pages).toHaveLength(3);
    for (const p of pages) expect((await PDFDocument.load(new Uint8Array(await p.arrayBuffer()))).getPageCount()).toBe(1);
  });
});

describe("BatchCapture", () => {
  const fetchMock = vi.fn();
  const sent: Array<{ url: string; fields: Record<string, string> }> = [];
  beforeEach(() => {
    sent.length = 0;
    let n = 0;
    fetchMock.mockReset().mockImplementation(async (url: string, init?: RequestInit) => {
      const fields: Record<string, string> = {};
      if (init?.body instanceof FormData) for (const [k, v] of init.body.entries()) if (typeof v === "string") fields[k] = v;
      sent.push({ url, fields });
      if (url === "/api/capture/scan/original") {
        return new Response(JSON.stringify({ ok: true, scan: "u/scans/s.pdf", pages: 2 }), { status: 200 });
      }
      n++;
      const body =
        n === 1
          ? { ok: true, merchant: "Byggmax", total: 2486, currency: "SEK", missing: null, duplicate: false }
          : n === 2
            ? { ok: true, merchant: "EasyPark", total: null, currency: "SEK", missing: "amount", duplicate: false }
            : { ok: true, skipped: true, reason: "This doesn't look like a receipt." };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("sends each file to /api/capture/scan and shows what was read", async () => {
    const onBusy = vi.fn();
    render(<BatchCapture initialFiles={[photo("1.jpg"), photo("2.jpg"), photo("3.jpg")]} onDone={() => {}} onBusyChange={onBusy} />);

    await waitFor(() => expect(screen.getByText("2 receipts saved")).toBeInTheDocument());
    expect(sent.every((s) => s.url === "/api/capture/scan")).toBe(true);
    expect(screen.getByText("Byggmax")).toBeInTheDocument();
    expect(screen.getByText("To confirm")).toBeInTheDocument();
    expect(screen.getByText("Missing amount")).toBeInTheDocument();
    expect(screen.getByText("This doesn't look like a receipt.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    // The sheet was told when reading started and when it ended. The "not
    // busy" call comes from an effect that runs after the screen above has
    // updated, so it is awaited (a slow CI runner read it too early).
    expect(onBusy).toHaveBeenCalledWith(true);
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(false));
  });

  it("stores a split scan whole first, then sends each page pointing at it", async () => {
    const user = userEvent.setup();
    render(<BatchCapture initialFiles={[await pdfWithPages(2)]} onDone={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Each page is a receipt" }));
    await waitFor(() => expect(sent.filter((s) => s.url === "/api/capture/scan")).toHaveLength(2));
    expect(sent[0].url).toBe("/api/capture/scan/original");
    expect(sent.slice(1).map((s) => s.fields)).toEqual([
      { scan: "u/scans/s.pdf", page: "1", pages: "2" },
      { scan: "u/scans/s.pdf", page: "2", pages: "2" },
    ]);
  });

  it("sends the whole file once when it's one receipt", async () => {
    const user = userEvent.setup();
    render(<BatchCapture initialFiles={[await pdfWithPages(2)]} onDone={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "One receipt" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ url: "/api/capture/scan", fields: { whole: "1" } });
  });

  it("pauses on the rate limit and offers to try again", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }));
    render(<BatchCapture initialFiles={[photo("1.jpg"), photo("2.jpg"), photo("3.jpg")]} onDone={() => {}} />);
    await waitFor(() => expect(screen.getByText(/That's a lot at once/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument());
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
