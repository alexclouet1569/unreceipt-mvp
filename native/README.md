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
git checkout claude/ios-app-shell
```

```bash
npm ci
```

```bash
npm run ios:sync
```

```bash
npm run ios:open
```

`ios:open` opens Xcode. The first time, Xcode downloads the Capacitor Swift packages (top bar: "Resolving packages"). Wait until it finishes.

### In the Simulator (no Apple account needed)

1. In Xcode's top bar, pick an iPhone simulator, e.g. "iPhone 16".
2. Press ▶ (or ⌘R).

The splash shows, then the UnReceipt login. Sign in with an existing account.

### On your iPhone (free Apple account)

1. Xcode → Settings → Accounts → **+** → Apple Account, and sign in.
2. In the left sidebar click **App** (the blue icon), then the **App** target → **Signing & Capabilities**.
3. Tick **Automatically manage signing** and choose **Team: \<your name\> (Personal Team)**.
4. Connect the iPhone with a cable and unlock it. On the phone, tap **Trust**. Turn on **Settings → Privacy & Security → Developer Mode** if asked; the phone restarts.
5. Pick your iPhone in Xcode's top bar and press ▶.
6. The first time, the phone refuses to open an app from an unknown developer. Go to **Settings → General → VPN & Device Management**, tap your Apple ID, then **Trust**. Press ▶ again.

With a free account, the app stops opening after **7 days**. Press ▶ again to reinstall it; your sign-in stays.

**Debug builds use `com.unreceipt.app.dev` on purpose.** A free Personal Team registers whatever bundle ID you run. If it ever registered the real `com.unreceipt.app`, the paid developer account could later be told the ID "is not available". Release builds (TestFlight, App Store) use `com.unreceipt.app`.

## Point the app at another server (development)

```bash
CAP_SERVER_URL=http://localhost:3000 npm run ios:sync
```

The Simulator reaches the Mac's `localhost`, so this shows your local `npm run dev`. A real iPhone can't reach it; use an `https://` address there. Vercel previews are behind Vercel login, so they don't work in the app.

**Before archiving for TestFlight, always run `npm run ios:sync` without `CAP_SERVER_URL`.** The script warns whenever the build points away from production.

## What to check on every build

1. **Start:** the splash shows the brand icon on cream, then the site. No white flash, no blank screen.
2. **Top and bottom edges:** the header sits below the status bar, and the + button sits above the home indicator, while scrolling too. If the header slides under the clock, tell Claude: it's the `contentInset` setting in `capacitor.config.ts`.
3. **Sign in** with the 6-digit code. Close the app completely (swipe it away), reopen it, and check you're still signed in.
4. **Links:** `/firm`, Settings and receipt details stay inside the app. The privacy page and other sites open in Safari.
5. **Camera:** + → take a photo. iOS asks for camera access with UnReceipt's sentence, and the receipt is read.
6. **Offline:** turn on Airplane mode and reopen the app. The "You're offline" screen shows. Turn Airplane mode off; it comes back by itself.
7. **Prices:** no prices, "subscribe" or "free week" anywhere (PR #102 must be live on the server for this).

Known gap: PDF and export downloads don't work inside the app yet. That's the next step (B4 in the plan).

## Regenerate the icon and splash

```bash
node native/assets/render-icons.mjs
```

It renders the brand mark (the same geometry as `src/app/icon2.svg`) and writes the files into `ios/App/App/Assets.xcassets`. It needs Playwright's Chromium; run `npx playwright install chromium` once.

## Version numbers

`APP_VERSION` in `capacitor.config.ts` and **Version** in Xcode (target App → General) must match. The website reads it from the user agent. Every TestFlight upload also needs a higher **Build** number in Xcode.
