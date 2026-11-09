import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { PDFDocument } from "pdf-lib";

vi.mock("@/lib/image-resize", () => ({ prepareImageForUpload: async (f: File) => f }));

import { BatchCapture, expandFiles } from "@/app/app/(authed)/BatchCapture";

async function pdfWithPages(n: number): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([200, 300]);
  return new File([(await doc.save()) as BlobPart], "scan.pdf", { type: "application/pdf" });
}

const photo = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });

describe("expandFiles", () => {
  it("turns each page of a scan into its own one-page PDF, photos stay as they are", async () => {
    const out = await expandFiles([await pdfWithPages(3), photo("a.jpg")]);
    expect(out.map((o) => o.label)).toEqual(["scan.pdf, page 1", "scan.pdf, page 2", "scan.pdf, page 3", "a.jpg"]);
    for (const o of out.slice(0, 3)) {
      if (!("file" in o)) throw new Error("expected a file");
      const page = await PDFDocument.load(new Uint8Array(await o.file.arrayBuffer()));
      expect(page.getPageCount()).toBe(1);
    }
  });

  it("reports a PDF that can't be opened instead of sending it", async () => {
    const out = await expandFiles([new File(["not a pdf"], "bad.pdf", { type: "application/pdf" })]);
    expect(out).toEqual([{ label: "bad.pdf", error: "This PDF couldn't be opened." }]);
  });
});

describe("BatchCapture", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    let n = 0;
    fetchMock.mockReset().mockImplementation(async () => {
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
    const onDone = vi.fn();
    render(<BatchCapture initialFiles={[photo("1.jpg"), photo("2.jpg"), photo("3.jpg")]} onDone={onDone} />);

    await waitFor(() => expect(screen.getByText("2 receipts saved")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([url]) => url === "/api/capture/scan")).toBe(true);
    expect(screen.getByText("Byggmax")).toBeInTheDocument();
    expect(screen.getByText("To confirm")).toBeInTheDocument();
    expect(screen.getByText("Missing amount")).toBeInTheDocument();
    expect(screen.getByText("This doesn't look like a receipt.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
  });

  it("pauses on the rate limit and offers to try again", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }));
    render(<BatchCapture initialFiles={[photo("1.jpg"), photo("2.jpg"), photo("3.jpg")]} onDone={() => {}} />);
    await waitFor(() => expect(screen.getByText(/That's a lot at once/)).toBeInTheDocument());
    // Stopped: the third file was never sent.
    await waitFor(() => expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument());
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
