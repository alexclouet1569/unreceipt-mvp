// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  getServerUser: mocks.getServerUser,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        upload: mocks.upload,
        remove: mocks.remove,
      }),
    },
    from: () => ({
      insert: (payload: unknown) => {
        mocks.insert(payload);
        return {
          select: () => ({
            single: mocks.single,
          }),
        };
      },
    }),
  }),
}));

import { POST } from "@/app/api/capture/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";

type ImageOverride = { blob: Blob; filename: string };
type Override = string | ImageOverride;

const buildFormData = (overrides: Partial<Record<string, Override>> = {}): FormData => {
  const fd = new FormData();
  fd.append("merchant", "ICA Maxi");
  fd.append("amount", "49");
  fd.append("currency", "EUR");
  fd.append("receipt_date", "2026-05-03");
  fd.append("category", "other");
  for (const [key, value] of Object.entries(overrides)) {
    fd.delete(key);
    if (value === undefined) continue;
    if (typeof value === "string") {
      fd.append(key, value);
    } else {
      fd.append(key, value.blob, value.filename);
    }
  }
  return fd;
};

const imageBlob = (filename = "ica.jpg", type = "image/jpeg"): ImageOverride => ({
  blob: new Blob(["fake"], { type }),
  filename,
});

const buildRequest = (fd: FormData) =>
  new NextRequest("http://localhost:3000/api/capture", {
    method: "POST",
    body: fd,
  });

describe("POST /api/capture", () => {
  beforeEach(() => {
    mocks.getServerUser.mockReset();
    mocks.upload.mockReset().mockResolvedValue({ error: null });
    mocks.remove.mockReset().mockResolvedValue({ error: null });
    mocks.insert.mockReset();
    mocks.single
      .mockReset()
      .mockResolvedValue({ data: { id: "rec-1" }, error: null });
  });

  it("returns 401 when no user is logged in", async () => {
    mocks.getServerUser.mockResolvedValue(null);

    const res = await POST(buildRequest(buildFormData()));

    expect(res.status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("returns 400 with zod issues when required fields are missing", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    const fd = new FormData();
    fd.append("merchant", "ICA Maxi");
    // missing amount, currency, receipt_date, category

    const res = await POST(buildRequest(fd));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects unknown currencies / categories / bad date format", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });

    expect(
      (await POST(buildRequest(buildFormData({ currency: "XYZ" })))).status
    ).toBe(400);
    expect(
      (await POST(buildRequest(buildFormData({ category: "rocket" })))).status
    ).toBe(400);
    expect(
      (await POST(buildRequest(buildFormData({ receipt_date: "tomorrow" }))))
        .status
    ).toBe(400);

    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns 200 + receipt id on success and inserts a 'captured' row", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });

    const res = await POST(
      buildRequest(buildFormData({ notes: "lunch with client" }))
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, id: "rec-1" });

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      user_id: USER_ID,
      merchant_name: "ICA Maxi",
      total: 49,
      currency: "EUR",
      category: "other",
      receipt_date: "2026-05-03",
      notes: "lunch with client",
      source: "captured",
      image_url: null,
      image_captured_at: null,
    });
  });

  it("returns 500 + clean error and skips orphan cleanup when DB insert fails (no image)", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    mocks.single.mockResolvedValue({
      data: null,
      error: { message: "duplicate key", code: "23505" },
    });

    const res = await POST(buildRequest(buildFormData()));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/duplicate key/);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("uploads the image, then removes the orphan when the DB insert fails", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    mocks.single.mockResolvedValue({
      data: null,
      error: { message: "constraint violation", code: "23514" },
    });

    const res = await POST(
      buildRequest(buildFormData({ image: imageBlob("ica.jpg") }))
    );

    expect(res.status).toBe(500);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const uploadedPath = mocks.upload.mock.calls[0][0] as string;
    expect(uploadedPath).toMatch(new RegExp(`^${USER_ID}/[0-9a-f-]+\\.jpg$`));

    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      image_url: uploadedPath,
    });

    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove.mock.calls[0][0]).toEqual([uploadedPath]);
  });

  it("returns 500 and does not insert when storage upload itself fails", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    mocks.upload.mockResolvedValue({
      error: { statusCode: 413, message: "storage quota" },
    });

    const res = await POST(
      buildRequest(buildFormData({ image: imageBlob("x.jpg") }))
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/storage quota/i);

    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
