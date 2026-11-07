"use client";

import { useEffect, useRef, useState } from "react";

// Glue between the website and the store app (capacitor.config.ts). In a
// browser window.Capacitor doesn't exist and none of this runs. Mounted in
// the root layout so it covers /app and /firm alike.
//
// 1. Splash: the native splash stays up until the website has painted, then
//    this hides it. The app hides it on its own after a few seconds if this
//    never runs (an older deploy, an error).
// 2. Downloads: the iOS web view ignores <a download> (a receipt PDF would
//    open full screen with no way back). Every download link is handed to
//    the app's Downloads plugin (ios/App/App/DownloadsPlugin.swift), which
//    fetches the file and opens the share sheet. Links need no changes: any
//    <a download> on any page is covered.

type PluginCall<T = unknown> = (options?: Record<string, unknown>) => Promise<T>;
type CapacitorGlobal = {
  Plugins?: {
    SplashScreen?: { hide?: PluginCall };
    Downloads?: { share?: PluginCall<{ completed?: boolean }> };
  };
};

type DownloadState = "idle" | "busy" | "network-error" | "error";

function capacitor(): CapacitorGlobal | undefined {
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function NativeAppBridge() {
  const [download, setDownload] = useState<DownloadState>("idle");
  const busy = useRef(false);

  useEffect(() => {
    const splash = capacitor()?.Plugins?.SplashScreen;
    if (!splash?.hide) return;
    try {
      splash.hide().catch(() => {});
    } catch {
      // A missing or older plugin: the native timeout hides the splash.
    }
  }, []);

  useEffect(() => {
    const downloads = capacitor()?.Plugins?.Downloads;
    // An app build from before the plugin: leave links as they are.
    if (!downloads?.share) return;
    let errorTimer: ReturnType<typeof setTimeout> | undefined;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const link = (event.target as Element | null)?.closest?.("a[download]");
      if (!(link instanceof HTMLAnchorElement)) return;
      const href = link.getAttribute("href");
      if (!href) return;
      event.preventDefault();
      if (busy.current) return;

      const url = new URL(href, window.location.href).href;
      const filename = link.getAttribute("download") || undefined;
      busy.current = true;
      clearTimeout(errorTimer);
      setDownload("busy");
      downloads
        .share!({ url, ...(filename ? { filename } : {}) })
        .then(() => setDownload("idle"))
        .catch((err: { code?: string } | undefined) => {
          // Only a failed fetch is about the connection; the plugin's other
          // refusals (host, saving, no screen) aren't.
          setDownload(err?.code === "DOWNLOAD_FAILED" ? "network-error" : "error");
          errorTimer = setTimeout(() => setDownload("idle"), 9000);
        })
        .finally(() => {
          busy.current = false;
        });
    };

    // Capture phase, so it runs before the browser follows the link.
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimeout(errorTimer);
    };
  }, []);

  const failed = download === "error" || download === "network-error";
  // Always in the DOM (empty when idle) so VoiceOver announces the change;
  // pointer-events-none so it never blocks the buttons underneath.
  return (
    <div
      role="status"
      className={
        download === "idle"
          ? "sr-only"
          : "fixed left-1/2 -translate-x-1/2 z-[60] w-max max-w-[calc(100vw-32px)] text-center pointer-events-none " +
            (failed ? "bg-[var(--attention-tint)] text-[var(--attention-deep)]" : "bg-card text-[var(--ink)]")
      }
      style={
        download === "idle"
          ? undefined
          : {
              // Above the capture button (64px + 24px from the bottom).
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 104px)",
              border: `1px solid ${failed ? "var(--attention)" : "var(--hairline)"}`,
              borderRadius: "12px",
              padding: "12px 14px",
              fontSize: "13px",
              fontWeight: 500,
              lineHeight: 1.4,
            }
      }
    >
      {download === "busy"
        ? "Preparing your file…"
        : download === "network-error"
          ? "The download didn't work. Check your connection and try again."
          : failed
            ? "The download didn't work. Try again."
            : ""}
    </div>
  );
}
