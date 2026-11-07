import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// The iOS app's own native code (NavigationGuardPlugin, DownloadsPlugin, the
// WebViewDelegateProxy safety net) is registered by AppViewController. It
// only runs if that class is the window's root screen. Until 2026-11-07
// SceneDelegate created a plain CAPBridgeViewController, so none of it ran:
// receipt PDFs opened full screen with no way back. Swift can't be compiled
// in CI, so this reads the source.
const app = path.resolve(__dirname, "../../../ios/App/App");
const read = (file: string) => readFileSync(path.join(app, file), "utf8");

describe("iOS shell wiring", () => {
  it("SceneDelegate makes AppViewController the root screen", () => {
    const scene = read("SceneDelegate.swift");
    expect(scene).toMatch(/rootViewController\s*=\s*AppViewController\(\)/);
    expect(scene).not.toMatch(/rootViewController\s*=\s*CAPBridgeViewController\(\)/);
  });

  it("AppViewController registers the app's own plugins and the safety net", () => {
    const controller = read("AppViewController.swift");
    expect(controller).toMatch(/class AppViewController:\s*CAPBridgeViewController/);
    expect(controller).toMatch(/registerPluginInstance\(NavigationGuardPlugin\(\)\)/);
    expect(controller).toMatch(/registerPluginInstance\(downloads\)/);
    expect(controller).toMatch(/WebViewDelegateProxy\(/);
  });
});
