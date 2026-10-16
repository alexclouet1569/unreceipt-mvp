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

type User = ReturnType<typeof userEvent.setup>;

const enterManually = async (user: User) => {
  await user.click(screen.getByRole("button", { name: /Enter it manually/i }));
};

const fillRequiredFields = async (user: User) => {
  await user.type(screen.getByLabelText(/Merchant/i), "ICA Maxi");
  await user.type(screen.getByLabelText(/Total paid/i), "49");
};

// The first hidden file input is "Upload" (no camera bias).
const uploadInput = () =>
  document.querySelector('input[type="file"]') as HTMLInputElement;

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

const captureCall = () =>
  mocks.fetch.mock.calls.find(([url]) => url === "/api/capture") as
    | [string, RequestInit]
    | undefined;

const OCR_RESULT = {
  merchant: "Clas Ohlson",
  amount: 245,
  currency: "SEK",
  receipt_date: "2026-10-16",
  category: "office_supplies",
  tax_amount: 49,
  tax_rate: 25,
  payment_method: "Card",
};

describe("CaptureDialog", () => {
  beforeEach(() => {
    mocks.router.refresh.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("opens on the photo choice, with manual entry one tap away", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByRole("button", { name: /Take photo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload photo or PDF/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Merchant/i)).toBeNull();

    await enterManually(user);
    expect(screen.getByLabelText(/Merchant/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Back$/i }));
    expect(screen.getByRole("button", { name: /Take photo/i })).toBeInTheDocument();
  });

  it("POSTs the manual form to /api/capture and refreshes on success", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue(okResponse());
    const { onOpenChange } = renderDialog();

    await enterManually(user);
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
    // jsdom's navigator.language is en-US, so no Swedish default.
    expect(fd.get("currency")).toBe("EUR");
    expect(fd.get("category")).toBe("other");
    expect(typeof fd.get("receipt_date")).toBe("string");
    expect(fd.get("notes")).toBeNull();
    expect(fd.get("image")).toBeNull();

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("reads a photo, shows the result for checking, and saves it with the image", async () => {
    const user = userEvent.setup();
    let releaseOcr: (() => void) | null = null;
    const ocrDeferred = new Promise<void>((resolve) => {
      releaseOcr = resolve;
    });
    mocks.fetch.mockImplementation((url: string) =>
      url === "/api/ocr"
        ? ocrDeferred.then(() => okResponse(OCR_RESULT))
        : Promise.resolve(okResponse()),
    );
    renderDialog();

    await user.upload(uploadInput(), new File(["fake"], "clas.jpg", { type: "image/jpeg" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/Reading your receipt/i);
    // Nothing to save until the photo is read.
    expect(screen.queryByRole("button", { name: /Save receipt/i })).toBeNull();

    releaseOcr!();

    expect(await screen.findByRole("heading", { name: /Check and save/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Total paid/i)).toHaveValue(245);
    expect(screen.getByLabelText(/Merchant/i)).toHaveValue("Clas Ohlson");
    expect(screen.getByLabelText(/Currency/i)).toHaveValue("SEK");
    expect(screen.getByLabelText(/^Date$/i)).toHaveValue("2026-10-16");
    expect(screen.getByLabelText(/Category/i)).toHaveValue("office_supplies");
    expect(screen.getByLabelText(/VAT rate/i)).toHaveValue("25");
    expect(screen.getByLabelText(/VAT amount/i)).toHaveValue(49);
    expect(screen.getByLabelText(/Payment method/i)).toHaveValue("Card");
    // VAT and the amount without it, in the receipt's own currency.
    expect(screen.getByText("49.00 kr")).toBeInTheDocument();
    expect(screen.getByText("196.00 kr")).toBeInTheDocument();
    expect(screen.getByText(/Read from your photo/i)).toBeInTheDocument();

    const ocrCall = mocks.fetch.mock.calls.find(([url]) => url === "/api/ocr") as
      | [string, RequestInit]
      | undefined;
    expect((ocrCall![1].body as FormData).get("image")).toBeInstanceOf(File);

    await user.click(screen.getByRole("button", { name: /Save receipt/i }));
    const fd = captureCall()![1].body as FormData;
    expect((fd.get("image") as File).name).toBe("clas.jpg");
    expect(fd.get("merchant")).toBe("Clas Ohlson");
    expect(fd.get("currency")).toBe("SEK");
    expect(fd.get("tax_amount")).toBe("49.00");
    expect(fd.get("tax_rate")).toBe("25");
  });

  it("keeps what the customer typed when a photo is added afterwards", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue(okResponse(OCR_RESULT));
    renderDialog();

    await enterManually(user);
    await user.type(screen.getByLabelText(/Merchant/i), "My typed name");
    await user.upload(uploadInput(), new File(["fake"], "r.jpg", { type: "image/jpeg" }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Total paid/i)).toHaveValue(245);
    });
    expect(screen.getByLabelText(/Merchant/i)).toHaveValue("My typed name");
  });

  it("falls back to the form, photo still attached, when the image isn't a receipt", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue(okResponse({ not_a_receipt: true }));
    renderDialog();

    await user.upload(uploadInput(), new File(["fake"], "cat.jpg", { type: "image/jpeg" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /doesn't look like a receipt/i
    );
    expect(screen.getByRole("heading", { name: /Fill in the details/i })).toBeInTheDocument();
    // No invented data.
    expect(screen.getByLabelText(/Merchant/i)).toHaveValue("");
    expect(screen.getByLabelText(/Total paid/i)).toHaveValue(null);
    expect(screen.getByRole("button", { name: /Remove photo/i })).toBeInTheDocument();
  });

  it("explains an OCR server failure and keeps the photo for a manual save", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockImplementation((url: string) =>
      url === "/api/ocr"
        ? Promise.resolve(errorResponse(500, { error: "OCR is not configured" }))
        : Promise.resolve(okResponse()),
    );
    renderDialog();

    await user.upload(uploadInput(), new File(["fake"], "r.jpg", { type: "image/jpeg" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't read this photo \(OCR is not configured\)/i
    );
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Save receipt/i }));
    const fd = captureCall()![1].body as FormData;
    expect((fd.get("image") as File).name).toBe("r.jpg");
  });

  it("drops the photo when the customer removes it", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue(okResponse({ not_a_receipt: true }));
    renderDialog();

    await user.upload(uploadInput(), new File(["fake"], "r.jpg", { type: "image/jpeg" }));
    await user.click(await screen.findByRole("button", { name: /Remove photo/i }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: /Upload file/i })).toBeInTheDocument();

    mocks.fetch.mockResolvedValue(okResponse());
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Save receipt/i }));
    expect((captureCall()![1].body as FormData).get("image")).toBeNull();
  });

  it("works out the VAT from the rate, and stops once the customer types it", async () => {
    const user = userEvent.setup();
    renderDialog();
    await enterManually(user);

    await user.type(screen.getByLabelText(/Total paid/i), "245");
    await user.selectOptions(screen.getByLabelText(/VAT rate/i), "25");
    expect(screen.getByLabelText(/VAT amount/i)).toHaveValue(49);
    expect(screen.getByText("Excl. VAT")).toBeInTheDocument();

    // A new total follows the rate…
    await user.clear(screen.getByLabelText(/Total paid/i));
    await user.type(screen.getByLabelText(/Total paid/i), "106");
    await user.selectOptions(screen.getByLabelText(/VAT rate/i), "6");
    expect(screen.getByLabelText(/VAT amount/i)).toHaveValue(6);
    await user.clear(screen.getByLabelText(/Total paid/i));
    await user.type(screen.getByLabelText(/Total paid/i), "212");
    expect(screen.getByLabelText(/VAT amount/i)).toHaveValue(12);

    // …until the customer types their own VAT amount (a mixed-rate receipt).
    await user.clear(screen.getByLabelText(/VAT amount/i));
    await user.type(screen.getByLabelText(/VAT amount/i), "20");
    await user.clear(screen.getByLabelText(/Total paid/i));
    await user.type(screen.getByLabelText(/Total paid/i), "300");
    expect(screen.getByLabelText(/VAT amount/i)).toHaveValue(20);
  });

  it("hides VAT and saves none when Include VAT is off, and remembers the choice", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockImplementation((url: string) =>
      Promise.resolve(okResponse(url === "/api/ocr" ? OCR_RESULT : { ok: true, id: "rec-1" })),
    );
    renderDialog();

    await user.upload(uploadInput(), new File(["fake"], "r.jpg", { type: "image/jpeg" }));
    const vatSwitch = await screen.findByRole("switch", { name: /Include VAT/i });
    expect(vatSwitch).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Excl. VAT")).toBeInTheDocument();

    await user.click(vatSwitch);
    expect(vatSwitch).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByLabelText(/VAT amount/i)).toBeNull();
    expect(screen.queryByText("Excl. VAT")).toBeNull();
    expect(window.localStorage.getItem("unreceipt.capture.includeVat")).toBe("false");

    await user.click(screen.getByRole("button", { name: /Save receipt/i }));
    const fd = captureCall()![1].body as FormData;
    // OCR read 49 kr of VAT, but the customer chose not to keep VAT.
    expect(fd.get("tax_amount")).toBeNull();
    expect(fd.get("tax_rate")).toBeNull();
    expect(fd.get("amount")).toBe("245.00");
  });

  it("starts with VAT off when the customer turned it off before", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("unreceipt.capture.includeVat", "false");
    renderDialog();
    await enterManually(user);

    expect(screen.getByRole("switch", { name: /Include VAT/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.queryByLabelText(/VAT rate/i)).toBeNull();

    await user.click(screen.getByRole("switch", { name: /Include VAT/i }));
    expect(screen.getByLabelText(/VAT rate/i)).toBeInTheDocument();
  });

  it("sends VAT, payment method and notes with the receipt", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue(okResponse());
    renderDialog();

    await enterManually(user);
    await fillRequiredFields(user);
    // 49 at 25 % → 9.80 VAT, worked out for the customer.
    await user.selectOptions(screen.getByLabelText(/VAT rate/i), "25");
    await user.type(screen.getByLabelText(/Payment method/i), "Swish");
    await user.click(screen.getByRole("button", { name: /Add a note/i }));
    await user.type(screen.getByLabelText(/Notes/i), "Team lunch");
    await user.click(screen.getByRole("button", { name: /Save receipt/i }));

    const fd = (mocks.fetch.mock.calls[0] as [string, RequestInit])[1]
      .body as FormData;
    expect(Number(fd.get("tax_amount"))).toBe(9.8);
    expect(fd.get("tax_rate")).toBe("25");
    expect(fd.get("payment_method")).toBe("Swish");
    expect(fd.get("notes")).toBe("Team lunch");
  });

  it("leaves VAT and payment method out when they are blank", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue(okResponse());
    renderDialog();

    await enterManually(user);
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Save receipt/i }));

    const fd = (mocks.fetch.mock.calls[0] as [string, RequestInit])[1]
      .body as FormData;
    expect(fd.get("tax_amount")).toBeNull();
    expect(fd.get("tax_rate")).toBeNull();
    expect(fd.get("payment_method")).toBeNull();
  });

  it("surfaces the server error and keeps the sheet open on non-OK response", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue(
      errorResponse(500, { error: "Save failed: db exploded" })
    );
    const { onOpenChange } = renderDialog();

    await enterManually(user);
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

    await enterManually(user);
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

    await enterManually(user);
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Save receipt/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/network down/i);
  });

  it("shows the field-level reason when the server rejects the form", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValue(
      errorResponse(400, {
        error: "validation failed",
        issues: [{ path: "tax_amount", message: "VAT can't be more than the total" }],
      }),
    );
    renderDialog();

    await enterManually(user);
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Save receipt/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /VAT can't be more than the total/,
    );
  });

  it("explains, instead of uploading, an iPhone HEIC photo this browser can't convert", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("The source image could not be decoded.");
      }),
    );
    renderDialog();

    const heic = new File(["fake"], "IMG_0001.HEIC", { type: "image/heic" });
    // image/heic matches the input's image/* accept, like a real picker.
    await user.upload(uploadInput(), heic);

    expect(await screen.findByRole("alert")).toHaveTextContent(/HEIC format/);
    expect(mocks.fetch).not.toHaveBeenCalled();
    // Still on the photo choice, so the customer can pick another file.
    expect(screen.getByRole("button", { name: /Take photo/i })).toBeInTheDocument();
  });
});
