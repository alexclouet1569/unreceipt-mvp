"use client";

import { useEffect } from "react";

// Inside the store app (capacitor.config.ts) the native splash screen stays
// up until the website has painted, then this hides it. In a browser
// window.Capacitor doesn't exist and this does nothing. Mounted in the root
// layout so it runs on /app and /firm alike; the app hides the splash on
// its own after a few seconds if this never runs (an older deploy, an error).

type SplashScreenPlugin = { hide?: () => Promise<void> };
type CapacitorGlobal = { Plugins?: { SplashScreen?: SplashScreenPlugin } };

export function NativeAppBridge() {
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
    const hide = cap?.Plugins?.SplashScreen?.hide;
    if (!hide) return;
    try {
      hide.call(cap!.Plugins!.SplashScreen).catch(() => {});
    } catch {
      // A missing or older plugin: the native timeout hides the splash.
    }
  }, []);
  return null;
}
