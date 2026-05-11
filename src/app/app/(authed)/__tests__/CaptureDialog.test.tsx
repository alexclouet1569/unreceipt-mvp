import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  router: { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() },
  fetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

import { CaptureDialog } from "@/app/app/(authed)/CaptureDialog";

const fillRequiredFields = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText(/Merchant/i), "ICA Maxi");
  await user.type(screen.getByLabelText(/Amount/i), "49");
};

const renderDialog = () => {
  const onOpenChange = vi.fn();
  const result = render(
    <CaptureDialog open={true} onOpenChange={onOpenChange} />
  );
  return { onOpenChange, ...result };
};

const okResponse = (body: unknown = { ok: true, id: "rec-1" }) =>
  ({
    ok: true,
    status: 200,
    json: async () => body,
  }) as unknown as Response;

const errorResponse = (status: number, body: unknown) =>
  ({
    ok: false,
    status,
    json: async () => body,
  }) as unknown as Response;

describe("CaptureDialog", () => {
  beforeEach(() => {
    mocks.router.refresh.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("POSTs the form fields to /api/capture and refreshes on success", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue(okResponse());
    const { onOpenChange } = renderDialog();

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Save receipt/i }));

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/capture");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);

    const fd = init.body as FormData;
    expect(fd.get("merchant")).toBe("ICA Maxi");
    expect(fd.get("amount")).toBe("49");
    expect(fd.get("currency")).toBe("EUR");
    expect(fd.get("category")).toBe("other");
    expect(typeof fd.get("receipt_date")).toBe("string");
    expect(fd.get("notes")).toBeNull();
    expect(fd.get("image")).toBeNull();

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("attaches the image when one is selected", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue(okResponse());
    renderDialog();

    await fillRequiredFields(user);

    const file = new File(["fake"], "ica.jpg", { type: "image/jpeg" });
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /Save receipt/i }));

    const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    const fd = init.body as FormData;
    const sent = fd.get("image");
    expect(sent).toBeInstanceOf(File);
    expect((sent as File).name).toBe("ica.jpg");
  });

  it("surfaces the server error and keeps the dialog open on non-OK response", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue(
      errorResponse(500, { error: "Save failed: db exploded" })
    );
    const { onOpenChange } = renderDialog();

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Save receipt/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Save failed: db exploded/i
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
    const retry = screen.getByRole("button", { name: /Try again/i });
    expect(retry).toBeEnabled();

    mocks.fetch.mockResolvedValue(okResponse());
    await user.click(retry);

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic HTTP message when the server response has no error field", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue(errorResponse(502, {}));
    renderDialog();

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Save receipt/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Save failed \(HTTP 502\)/i
    );
  });

  it("surfaces network errors thrown by fetch itself", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockRejectedValue(new Error("network down"));
    renderDialog();

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Save receipt/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/network down/i);
  });

  it("auto-fills empty fields with OCR result but preserves user-typed merchant", async () => {
    const user = userEvent.setup();
    let releaseOcr: (() => void) | null = null;
    const ocrDeferred = new Promise<void>((resolve) => {
      releaseOcr = resolve;
    });
    mocks.fetch.mockImplementation((url: string) => {
      if (url === "/api/ocr") {
        return ocrDeferred.then(() =>
          okResponse({
            merchant: "Stripe",
            amount: 49.5,
            currency: "SEK",
            receipt_date: "2026-04-12",
            category: "software",
          })
        );
      }
      return Promise.resolve(okResponse({ ok: true, id: "rec-1" }));
    });

    renderDialog();
    // User types into Merchant BEFORE selecting the image — OCR must not
    // overwrite this value.
    await user.type(screen.getByLabelText(/Merchant/i), "My typed name");

    const file = new File(["fake"], "ica.jpg", { type: "image/jpeg" });
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, file);

    // Loading microcopy appears while OCR is in flight.
    expect(await screen.findByRole("status")).toHaveTextContent(
      /Reading your receipt/i
    );

    // Resolve the deferred fetch — now the OCR result should apply.
    releaseOcr!();

    // After OCR resolves, empty fields get populated, merchant stays typed.
    await waitFor(() => {
      expect(screen.getByLabelText(/Amount/i)).toHaveValue(49.5);
    });
    expect(screen.getByLabelText(/Merchant/i)).toHaveValue("My typed name");
    expect(screen.getByLabelText(/Currency/i)).toHaveValue("SEK");
    expect(screen.getByLabelText(/Date/i)).toHaveValue("2026-04-12");
    expect(screen.getByLabelText(/Category/i)).toHaveValue("software");

    // The /api/ocr fetch fired with the image attached.
    const ocrCall = mocks.fetch.mock.calls.find(
      ([url]) => url === "/api/ocr"
    ) as [string, RequestInit] | undefined;
    expect(ocrCall).toBeDefined();
    expect((ocrCall![1].body as FormData).get("image")).toBeInstanceOf(File);
  });

  it("falls back silently when OCR returns not_a_receipt", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue(okResponse({ not_a_receipt: true }));
    renderDialog();

    const file = new File(["fake"], "cat.jpg", { type: "image/jpeg" });
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, file);

    // No fields get filled, no scary error, user can still type.
    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Merchant/i)).toHaveValue("");
    expect(screen.getByLabelText(/Amount/i)).toHaveValue(null);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
