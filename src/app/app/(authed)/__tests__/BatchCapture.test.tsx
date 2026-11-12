import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PDFDocument, PDFName, PDFDict } from "pdf-lib";

vi.mock("@/lib/image-resize", () => ({ prepareImageForUpload: async (f: File) => f }));

import { BatchCapture, expandFiles, newClientId, rateLimitMessage, splitPages } from "@/app/app/(authed)/BatchCapture";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const withoutClientId = (fields: Record<string, string>) => {
  const rest = { ...fields };
  delete rest.client_id;
  return rest;
};

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
    // The sheet was told when reading started and when it ended.
    expect(onBusy).toHaveBeenCalledWith(true);
    expect(onBusy).toHaveBeenLastCalledWith(false);
  });

  it("stores a split scan whole first, then sends each page pointing at it", async () => {
    const user = userEvent.setup();
    render(<BatchCapture initialFiles={[await pdfWithPages(2)]} onDone={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Each page is a receipt" }));
    await waitFor(() => expect(sent.filter((s) => s.url === "/api/capture/scan")).toHaveLength(2));
    expect(sent[0].url).toBe("/api/capture/scan/original");
    expect(sent.slice(1).map((s) => withoutClientId(s.fields))).toEqual([
      { scan: "u/scans/s.pdf", page: "1", pages: "2" },
      { scan: "u/scans/s.pdf", page: "2", pages: "2" },
    ]);
    // Each page is its own receipt, with its own id.
    expect(sent[1].fields.client_id).not.toBe(sent[2].fields.client_id);
  });

  it("sends the whole file once when it's one receipt", async () => {
    const user = userEvent.setup();
    render(<BatchCapture initialFiles={[await pdfWithPages(2)]} onDone={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "One receipt" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ url: "/api/capture/scan", fields: { whole: "1", client_id: expect.stringMatching(UUID) } });
  });

  it("pauses on the rate limit, says how long from Retry-After, and offers to try again", async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "Retry-After": "1500" } })
    );
    render(<BatchCapture initialFiles={[photo("1.jpg"), photo("2.jpg"), photo("3.jpg")]} onDone={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Try again in about 25 minutes/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument());
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("sends each file's own client_id, the same one again on Try again, and reports each save", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    let calls = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const fields: Record<string, string> = {};
      if (init?.body instanceof FormData) for (const [k, v] of init.body.entries()) if (typeof v === "string") fields[k] = v;
      sent.push({ url, fields });
      calls++;
      // The first answer is lost on the way back.
      if (calls === 1) throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify({ ok: true, merchant: "Byggmax", total: 10, currency: "SEK", missing: null }), { status: 200 });
    });
    render(<BatchCapture initialFiles={[photo("1.jpg")]} onDone={() => {}} onSaved={onSaved} />);
    await user.click(await screen.findByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(screen.getByText("1 receipt saved")).toBeInTheDocument());
    expect(sent).toHaveLength(2);
    expect(sent[0].fields.client_id).toMatch(UUID);
    expect(sent[1].fields.client_id).toBe(sent[0].fields.client_id);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});

describe("rateLimitMessage", () => {
  it("names the wait from Retry-After, and says it plainly without one", () => {
    expect(rateLimitMessage("30")).toBe("You've reached the reading limit for now. Keep this open and press Try again in about a minute.");
    expect(rateLimitMessage("3600")).toBe("You've reached the reading limit for now. Keep this open and press Try again in about 60 minutes.");
    expect(rateLimitMessage("36000")).toBe("You've reached the reading limit for now. Keep this open and press Try again in about 10 hours.");
    for (const missing of [null, "", "soon", "0"]) {
      expect(rateLimitMessage(missing)).toMatch(/You.ve scanned a lot in the last hour\. Keep this open and press Try again later/);
    }
  });
});

describe("newClientId", () => {
  it("is a v4 UUID, also without crypto.randomUUID", () => {
    expect(newClientId()).toMatch(UUID);
    const original = crypto.randomUUID;
    try {
      Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
      expect(newClientId()).toMatch(UUID);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });
});
