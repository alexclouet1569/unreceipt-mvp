# The UnReceipt iOS app

One app for both roles. It opens `app.unreceipt.com/app`, which sends accountants on to `/firm`. Plan: `docs/plans/unreceipt-store-apps-plan.md`. Android comes later.

## What's in it

| Path | What it is |
|---|---|
| `capacitor.config.ts` | App ID, the server it loads, the user-agent marker, splash settings |
| `ios/` | The Xcode project (Swift Package Manager, no CocoaPods) |
| `native/www/offline.html` | Shown when the site can't be reached. Bundled in the app, so it works with no connection |
| `native/assets/` | The icon and splash source images, plus `render-icons.mjs`, which regenerates them |
| `scripts/ios-sync.mjs` | `npm run ios:sync`: copies the config, the offline page and the plugins into `ios/` |
| `scripts/ios-run.mjs` | `npm run ios:run`: sync, build, install and open the app in the Simulator from Terminal, with the app's log |
| `ios/App/App/NavigationGuardPlugin.swift` | Our first native code. Keeps only app.unreceipt.com inside the app; every other page opens in Safari, because every page inside the app gets the native bridge |
| `ios/App/App/DownloadsPlugin.swift` | Downloads: fetches a receipt PDF, an original or an export and opens the share sheet (Save to Files, Mail, AirDrop) |
| `ios/App/App/WebViewDelegateProxy.swift` | Safety net: a file that would replace the page goes to the share sheet, so the app never gets stuck on a PDF; a cancelled load doesn't show the offline screen |
| `ios/App/App/AppViewController.swift` | Registers our own plugins and the safety net (set as the screen's class in `Main.storyboard`) |

The screens are the website, so a website deploy reaches the app without a new App Store review. Native code goes in `ios/` (Swift).

## Run it on your Mac

You need:
- macOS with the current **Xcode** (Mac App Store). Open it once and accept the extra components it offers.
- **Node 22 or newer** (`node -v`).
- This repository.

```bash
git clone https://github.com/alexclouet1569/unreceipt-mvp.git
```

```bash
cd unreceipt-mvp
```

```bash
npm ci
```

### In the Simulator (no Apple account needed): one command

Quit Xcode first (⌘Q). Then, in Terminal, in the repository folder:

```bash
npm run ios:run
```

It copies the config into `ios/`, builds the app, starts the Simulator, installs this build over the old one (you stay signed in) and opens it. The first build takes 3 to 8 minutes. Terminal then shows the app's log until you press Ctrl-C. Lines starting with `[UnReceipt]` come from our native code; copy them to Claude when something goes wrong.

The splash shows, then the UnReceipt login. Sign in with an existing account.

- **After every `git pull`**, run `npm ci` if `package-lock.json` changed, then `npm run ios:run` again. It always builds the code in this folder, so an older build can't be left in the Simulator.
- **"Missing package product …"** (seen in the Xcode window on 2026-11-07, while the same project built fine from Terminal): run `npm run ios:run -- --clean`. It clears Xcode's package caches for this project and builds again.
- **Another simulator:** `npm run ios:run -- --device "iPhone 17"`.

### In the Xcode window

Needed for your own iPhone and, later, for uploading to TestFlight.

```bash
npm run ios:sync
```

```bash
npm run ios:open
```

`ios:open` opens Xcode on `ios/App/App.xcodeproj`. Open the project only this way: if `Package.swift` is also open in another Xcode window, Xcode reports "Missing package product". The first time, Xcode downloads the Capacitor Swift packages (top bar: "Resolving packages"). Wait until it finishes, pick a simulator in the top bar and press ▶ (⌘R). If it reports "Missing package product", use **File → Packages → Reset Package Caches** once; if it still does, quit Xcode, run `npm run ios:run -- --clean`, then open Xcode again.

After the first successful build, commit the file Xcode creates at `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`. It pins the exact Capacitor code, not just the version tag.

### On your iPhone (free Apple account)

1. Xcode → Settings → Accounts → **+** → Apple Account, and sign in.
2. In the left sidebar click **App** (the blue icon), then the **App** target → **Signing & Capabilities**.
3. Tick **Automatically manage signing** and choose **Team: \<your name\> (Personal Team)**.
4. Connect the iPhone with a cable and unlock it. On the phone, tap **Trust**. Turn on **Settings → Privacy & Security → Developer Mode** if asked; the phone restarts.
5. Pick your iPhone in Xcode's top bar and press ▶.
6. The first time, the phone refuses to open an app from an unknown developer. Go to **Settings → General → VPN & Device Management**, tap your Apple ID, then **Trust**. Press ▶ again.

With a free account, the app stops opening after **7 days**. Press ▶ again to reinstall it; your sign-in stays.

**Debug builds use `com.unreceipt.app.dev` on purpose.** A free Personal Team registers whatever bundle ID you run. If it ever registered the real `com.unreceipt.app`, the paid developer account could later be told the ID "is not available". Release builds (TestFlight, App Store) use `com.unreceipt.app`.

**The first build is the first time this Swift code meets a compiler.** It was written on Linux, where iOS code can't be compiled. If Xcode shows a red error, copy the message to Claude.

## Point the app at another server (development)

```bash
CAP_SERVER_URL=http://localhost:3000 npm run ios:sync
```

The Simulator reaches the Mac's `localhost`, so this shows your local `npm run dev`. A real iPhone can't reach it; use an `https://` address there. Vercel previews are behind Vercel login, so they don't work in the app.

**Before archiving for TestFlight, run `npm run ios:sync` without `CAP_SERVER_URL`.** A Release build (Product → Archive) stops with an error otherwise.

## What to check on every build

1. **Start:** the splash shows the brand icon on cream, then the site. No white flash, no blank screen.
2. **Top and bottom edges:** the header sits below the status bar, and the + button sits above the home indicator, while scrolling too. Open the capture sheet (+) and a dialog: today they stop at a cream band above the home indicator instead of reaching the edge. That's expected for now; tell Claude if anything else slides under the clock. It's the `contentInset` setting in `capacitor.config.ts`.
3. **Sign in** with the 6-digit code. Close the app completely (swipe it away), reopen it, and check you're still signed in.
4. **Links:** `/firm`, Settings and receipt details stay inside the app. The privacy page, "Open Gmail" and other sites open in Safari. The receipt's PDF preview still shows inside the receipt.
5. **Camera:** + → take a photo. iOS asks for camera access with UnReceipt's sentence, and the receipt is read.
6. **Offline:** turn on Airplane mode and reopen the app. The "Can't reach UnReceipt" screen shows. Turn Airplane mode off; it comes back by itself.
7. **Dark mode:** switch the iPhone to dark mode. The app stays light, with a dark clock and battery on cream.
8. **Prices:** no prices, "subscribe" or "free week" anywhere (PR #102 must be live on the server for this).

9. **Downloads** (needs a new build, because this is native code: `git pull`, then `npm run ios:run`. An older build opens the PDF full screen with no way back; if that happens, the Simulator is still running an old build):
   - Open a receipt and tap **Download PDF**: "Preparing your file…" appears, then the share sheet. Choose **Save to Files** and check the PDF opens.
   - Settings → **Export** a month, then tap the ZIP: the share sheet again.
   - In a receipt's **Original** tab, tap **Download original**.

## Regenerate the icon and splash

```bash
node native/assets/render-icons.mjs
```

It renders the brand mark (the same geometry as `src/app/icon2.svg`) and writes the files into `ios/App/App/Assets.xcassets`. It needs Playwright's Chromium; run `npx playwright install chromium` once.

## Version numbers

`APP_VERSION` in `capacitor.config.ts` and **Version** in Xcode (target App → General) must match. The website reads it from the user agent. Every TestFlight upload also needs a higher **Build** number in Xcode.
