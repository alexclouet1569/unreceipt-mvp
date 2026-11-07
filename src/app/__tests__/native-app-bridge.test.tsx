import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NativeAppBridge } from "../_native-app-bridge";

type Win = { Capacitor?: unknown };

afterEach(() => {
  cleanup();
  delete (window as Win).Capacitor;
  document.body.innerHTML = "";
});

function link(attrs: Record<string, string>, text = "Download"): HTMLAnchorElement {
  const a = document.createElement("a");
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  a.textContent = text;
  document.body.appendChild(a);
  return a;
}

/** Clicks like a user and reports whether the browser would follow the link. */
function click(el: Element): boolean {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  el.dispatchEvent(event);
  return !event.defaultPrevented;
}

describe("NativeAppBridge: splash", () => {
  it("hides the store app's splash screen once the page has mounted", () => {
    const hide = vi.fn().mockResolvedValue(undefined);
    (window as Win).Capacitor = { Plugins: { SplashScreen: { hide } } };
    render(<NativeAppBridge />);
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it("does nothing in a browser, or when the plugin fails", () => {
    expect(() => render(<NativeAppBridge />)).not.toThrow();
    cleanup();
    (window as Win).Capacitor = {
      Plugins: { SplashScreen: { hide: vi.fn().mockRejectedValue(new Error("no splash")) } },
    };
    expect(() => render(<NativeAppBridge />)).not.toThrow();
  });
});

describe("NativeAppBridge: downloads", () => {
  it("hands download links to the app's share sheet with an absolute URL and the file name", async () => {
    let finish!: () => void;
    const share = vi.fn(() => new Promise<{ completed: boolean }>((r) => (finish = () => r({ completed: true }))));
    (window as Win).Capacitor = { Plugins: { Downloads: { share } } };
    render(<NativeAppBridge />);

    const pdf = link({ href: "/api/receipts/r1/pdf", download: "" });
    expect(click(pdf)).toBe(false);
    expect(share).toHaveBeenCalledWith({ url: `${window.location.origin}/api/receipts/r1/pdf` });
    expect(await screen.findByRole("status")).toHaveTextContent("Preparing your file");

    // A second tap while it's still downloading doesn't start another one.
    click(pdf);
    expect(share).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(screen.getByRole("status")).toHaveTextContent("");

    const zip = link({ href: "https://abc.supabase.co/storage/v1/object/sign/exports/x.zip?token=t", download: "receipts-2026.zip" });
    click(zip);
    expect(share).toHaveBeenLastCalledWith({
      url: "https://abc.supabase.co/storage/v1/object/sign/exports/x.zip?token=t",
      filename: "receipts-2026.zip",
    });
  });

  it("says so when the download fails, blaming the connection only when it was the fetch", async () => {
    const share = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "DOWNLOAD_FAILED" }))
      .mockRejectedValueOnce(Object.assign(new Error("no"), { code: "HOST_NOT_ALLOWED" }));
    (window as Win).Capacitor = { Plugins: { Downloads: { share } } };
    render(<NativeAppBridge />);
    const pdf = link({ href: "/api/receipts/r1/pdf", download: "" });

    click(pdf);
    expect(await screen.findByText(/Check your connection/)).toBeInTheDocument();
    click(pdf);
    expect(await screen.findByText("The download didn't work. Try again.")).toBeInTheDocument();
  });

  it("leaves links alone in a browser, in an app build without the plugin, and for normal links", () => {
    render(<NativeAppBridge />);
    expect(click(link({ href: "/api/receipts/r1/pdf", download: "" }))).toBe(true);
    cleanup();

    (window as Win).Capacitor = { Plugins: {} };
    render(<NativeAppBridge />);
    expect(click(link({ href: "/api/receipts/r1/pdf", download: "" }))).toBe(true);
    cleanup();

    const share = vi.fn().mockResolvedValue({});
    (window as Win).Capacitor = { Plugins: { Downloads: { share } } };
    render(<NativeAppBridge />);
    expect(click(link({ href: "/app/settings" }))).toBe(true);
    expect(share).not.toHaveBeenCalled();
  });
});
