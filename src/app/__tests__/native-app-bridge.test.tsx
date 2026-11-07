import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NativeAppBridge } from "../_native-app-bridge";

type Win = { Capacitor?: unknown };

afterEach(() => {
  cleanup();
  delete (window as Win).Capacitor;
});

describe("NativeAppBridge", () => {
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
