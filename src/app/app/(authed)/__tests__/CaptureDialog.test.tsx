import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  router: { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() },
  upload: vi.fn(),
  remove: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

vi.mock("@/lib/supabase-client", () => ({
  getSupabaseClient: () => ({
    storage: {
      from: () => ({
        upload: mocks.upload,
        remove: mocks.remove,
      }),
    },
    from: () => ({
      insert: mocks.insert,
    }),
  }),
}));

import { CaptureDialog } from "@/app/app/(authed)/CaptureDialog";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const fillRequiredFields = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText(/Merchant/i), "ICA Maxi");
  await user.type(screen.getByLabelText(/Amount/i), "49");
};

const renderDialog = async () => {
  const onOpenChange = vi.fn();
  // Need a setup that doesn't complain about pointer events on shadcn Dialog.
  const result = render(
    <CaptureDialog userId={USER_ID} open={true} onOpenChange={onOpenChange} />
  );
  return { onOpenChange, ...result };
};

describe("CaptureDialog (CQ2)", () => {
  beforeEach(() => {
    mocks.router.refresh.mockReset();
    mocks.upload.mockReset();
    mocks.remove.mockReset().mockResolvedValue({ error: null });
    mocks.insert.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("saves a receipt without an image and refreshes the route", async () => {
    const user = userEvent.setup();
    mocks.insert.mockResolvedValue({ error: null });
    const { onOpenChange } = await renderDialog();

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Save receipt/i }));

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      user_id: USER_ID,
      merchant_name: "ICA Maxi",
      total: 49,
      currency: "EUR",
      category: "other",
      source: "captured",
      image_url: null,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows a visible error and keeps the dialog open when the DB insert fails", async () => {
    const user = userEvent.setup();
    mocks.insert.mockResolvedValue({
      error: { message: "duplicate key" },
    });
    const { onOpenChange } = await renderDialog();

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /Save receipt/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Could not save receipt/i
    );
    // Dialog must NOT close on failure.
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
    // Save button is re-enabled with a "Try again" affordance.
    const retry = screen.getByRole("button", { name: /Try again/i });
    expect(retry).toBeEnabled();

    // Retry succeeds.
    mocks.insert.mockResolvedValue({ error: null });
    await user.click(retry);

    expect(mocks.insert).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
  });

  it("removes the orphan image when the DB insert fails after a successful storage upload", async () => {
    const user = userEvent.setup();
    mocks.upload.mockResolvedValue({ error: null });
    mocks.insert.mockResolvedValue({
      error: { message: "constraint violation" },
    });

    await renderDialog();

    await fillRequiredFields(user);

    // Attach a file via the hidden input.
    const file = new File(["fake"], "ica.jpg", { type: "image/jpeg" });
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /Save receipt/i }));

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const uploadedPath = mocks.upload.mock.calls[0][0] as string;
    expect(uploadedPath).toMatch(new RegExp(`^${USER_ID}/[0-9a-f-]+\\.jpg$`));

    // Insert was attempted with the uploaded path.
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      image_url: uploadedPath,
    });

    // CQ2 atomicity: orphan cleanup fires with the same path.
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove.mock.calls[0][0]).toEqual([uploadedPath]);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Could not save receipt/i
    );
  });

  it("shows the error and skips the orphan cleanup when storage upload itself fails", async () => {
    const user = userEvent.setup();
    mocks.upload.mockResolvedValue({
      error: { message: "storage quota" },
    });

    await renderDialog();
    await fillRequiredFields(user);

    const file = new File(["fake"], "x.jpg", { type: "image/jpeg" });
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /Save receipt/i }));

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Could not save receipt/i
    );
  });
});
