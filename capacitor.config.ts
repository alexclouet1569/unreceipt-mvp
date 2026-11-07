import type { CapacitorConfig } from "@capacitor/cli";

// The UnReceipt store app (iOS first; Android later). One app for both
// roles: it opens app.unreceipt.com/app, which sends accountants on to /firm.
// Plan: docs/plans/unreceipt-store-apps-plan.md. How to run it: native/README.md.
//
// The screens come from the website; the app adds what a website can't:
// icon, splash, an offline screen, and (next steps) the scanner, share
// sheet and push. A website deploy reaches the app without a new review.

// Keep in step with MARKETING_VERSION in ios/App/App.xcodeproj (Xcode →
// target App → General → Version). The website reads it from the user agent
// (src/lib/native-app.ts) to hide purchase prompts inside the app.
export const APP_VERSION = "1.0.0";

// For development only: point the app at another server, e.g.
//   CAP_SERVER_URL=http://localhost:3000 npx cap sync ios
// (the iOS Simulator reaches the Mac's localhost). Never ship a build that
// points anywhere but production.
//
// The bare origin, no path: Capacitor keeps a link inside the app only when
// it starts with this URL, so ".../app" would push /firm, /subscribe and
// /auth/* out to Safari. The start page is set with appStartPath below.
// That check is a plain string prefix (https://app.unreceipt.com.evil.com
// would pass it), so the app's own NavigationGuardPlugin
// (ios/App/App/NavigationGuardPlugin.swift) runs first and keeps only this
// exact host inside the app. A trailing slash here would also close it, but
// breaks Capacitor's CORS header for app-local files, which the scanner needs.
const serverUrl = (process.env.CAP_SERVER_URL || "https://app.unreceipt.com").replace(/\/+$/, "");
// Checked here so every `npx cap …` command enforces it, not only
// npm run ios:sync. Release builds are also refused by Xcode unless this is
// production (build phase "Check production server (Release)").
if (!/^(https:\/\/[a-z0-9.-]+|http:\/\/(localhost|127\.0\.0\.1))(:\d+)?$/i.test(serverUrl)) {
  throw new Error(`CAP_SERVER_URL must be https://<host> or http://localhost:<port>, got ${serverUrl}`);
}

const config: CapacitorConfig = {
  appId: "com.unreceipt.app",
  appName: "UnReceipt",
  // Only the offline page lives in the app; everything else is the website.
  webDir: "native/www",
  server: {
    url: serverUrl,
    // Opens <serverUrl>/app. Capacitor also requires native/www/app/ to exist.
    appStartPath: "app",
    // Shown when app.unreceipt.com can't be reached, so the app never shows
    // a blank screen (App Store guideline 4.2).
    errorPath: "offline.html",
  },
  ios: {
    appendUserAgent: `UnReceiptApp/${APP_VERSION} (ios)`,
    // --surface (DESIGN.md): what shows behind the status bar and before the
    // first paint, so there's no white flash.
    backgroundColor: "#FAFAF7",
    // Keep the website below the status bar and above the home indicator.
    // The site doesn't use viewport-fit=cover, so iOS insets it instead and
    // the two bands show backgroundColor. To check on a notched iPhone: the
    // capture sheet and dialog overlays stop at those bands. The fuller fix
    // (viewport-fit=cover + "never" + env() padding on the headers) changes
    // the website too, so it's a separate step.
    contentInset: "always",
    // Long-press link previews would open our own pages in a Safari sheet.
    allowsLinkPreview: false,
    // webContentsDebuggingEnabled is left at Capacitor's default: on for
    // debug builds (Safari → Develop → your iPhone), off for release builds.
  },
  plugins: {
    SplashScreen: {
      // The website hides the splash once it has painted
      // (src/app/_native-app-bridge.tsx, in the root layout); this is the
      // fallback if it never does.
      launchAutoHide: true,
      launchShowDuration: 4000,
      launchFadeOutDuration: 200,
      backgroundColor: "#FAFAF7",
      showSpinner: false,
    },
  },
};

export default config;
