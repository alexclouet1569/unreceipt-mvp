// Is this page running inside the UnReceipt store app (the Capacitor shell
// around app.unreceipt.com)? The shell appends `UnReceiptApp/<version>
// (<ios|android>)` to the webview's user agent (capacitor.config.ts,
// `ios.appendUserAgent` / `android.appendUserAgent`).
//
// Used ONLY to choose what the page shows: the store apps carry no
// purchases and no calls to action to buy elsewhere (App Store guideline
// 3.1.3(f); the same rule on Android, docs/plans/unreceipt-store-apps-plan.md
// S3). A user agent is trivially spoofed, so it must never decide access,
// pricing or anything else a user could gain by faking it.
//
// Safe to import from client and server code; the server reads it with
// getNativeApp() in native-app-server.ts.

export type NativePlatform = "ios" | "android";

export type NativeApp = {
  platform: NativePlatform;
  /** The shell's own version (CFBundleShortVersionString / versionName). */
  version: string;
};

export const NATIVE_UA_PRODUCT = "UnReceiptApp";

const NATIVE_UA_RE = /(?:^|\s)UnReceiptApp\/(\d{1,4}(?:\.\d{1,4}){0,2}) \((ios|android)\)/;

/** The UA token the shell appends, e.g. `UnReceiptApp/1.0.0 (ios)`. */
export function nativeUserAgentToken(platform: NativePlatform, version: string): string {
  return `${NATIVE_UA_PRODUCT}/${version} (${platform})`;
}

export function parseNativeApp(userAgent: string | null | undefined): NativeApp | null {
  if (!userAgent) return null;
  const m = NATIVE_UA_RE.exec(userAgent);
  if (!m) return null;
  return { version: m[1], platform: m[2] as NativePlatform };
}
