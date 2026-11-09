// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";

const mocks = vi.hoisted(() => ({ uploads: [] as Array<{ path: string; bytes: Buffer }> }));
vi.mock("@/lib/supabase-server", () => ({ getServerUser: async () => ({ id: "11111111-1111-4111-8111-111111111111" }) }));
vi.mock("@/lib/subscription-gate", () => ({ hasProductAccess: async () => true, subscriptionRequiredResponse: () => new Response(null, { status: 402 }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ ok: true }), rateLimitedResponse: () => new Response(null, { status: 429 }) }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    storage: { from: () => ({ upload: async (path: string, bytes: Buffer) => (mocks.uploads.push({ path, bytes }), { error: null }) }) },
  }),
}));

import { POST } from "@/app/api/capture/scan/original/route";

async function pdf(pages: number, attachment = false): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 300]);
  if (attachment) await doc.attach(Buffer.from("<Invoice/>").toString("base64"), "factur-x.xml", { mimeType: "application/xml" });
  return new File([(await doc.save()) as BlobPart], "scan.pdf", { type: "application/pdf" });
}
const post = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return POST(new NextRequest("https://app.unreceipt.com/api/capture/scan/original", { method: "POST", body: form }));
};

beforeEach(() => {
  mocks.uploads = [];
});

describe("POST /api/capture/scan/original", () => {
  it("stores the scan byte for byte under the user's scans folder", async () => {
    const file = await pdf(3);
    const res = await post(file);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pages).toBe(3);
    expect(body.scan).toMatch(/^11111111-1111-4111-8111-111111111111\/scans\/[0-9a-f-]{36}\.pdf$/);
    expect(Buffer.compare(mocks.uploads[0].bytes, Buffer.from(await file.arrayBuffer()))).toBe(0);
  });

  it("refuses what must be read whole: one page, or an e-invoice carrying files", async () => {
    expect((await post(await pdf(1))).status).toBe(400);
    expect((await post(await pdf(2, true))).status).toBe(400);
    expect((await post(new File(["junk"], "x.pdf", { type: "application/pdf" }))).status).toBe(400);
    expect(mocks.uploads).toHaveLength(0);
  });
});
