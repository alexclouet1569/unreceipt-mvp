# Handoff: store apps work (written 2026-11-07)

Paste this at the start of a new Claude Code session:

> Repo alexclouet1569/unreceipt-mvp. Read AGENTS.md, DESIGN.md, docs/plans/unreceipt-store-apps-plan.md, native/README.md and this file (docs/plans/next-session-handoff.md), then continue from "Open problem" below. I'm the founder, not a developer: explain Mac/Xcode steps simply, one step at a time, and be honest and critical rather than agreeable.

## Where things stand

**Merged and live on `main`** (each built, reviewed by `.claude/agents/` and green in CI):

| PR | What |
|---|---|
| #102 | Account deletion for accountants (`/firm/settings`), with the firm settled first (admin handover or close, clients emailed). No prices or purchase prompts inside the app (`src/lib/native-app.ts`, App Store 3.1.3(f)). |
| #103 | The iOS app: Capacitor 8.5.3 project in `ios/`, offline screen, icon and splash, `NavigationGuardPlugin.swift`, the Release build check. "Firm portal → Open/Join <firm>" in `/app/settings`. Month name on the dashboard total. |
| #105 | Dashboard total: tap it to pick a month or "All time" (native `<select>`). |
| #106 | Downloads in the app: `DownloadsPlugin.swift` plus `NativeAppBridge` route every `<a download>` to the iOS share sheet. |
| #107 | Safety net: `WebViewDelegateProxy.swift`. A file (PDF, ZIP) that would replace the page goes to the share sheet, and a cancelled load doesn't show the offline page. |

**Tested by the founder in the iOS Simulator (iPhone 18 Pro, iOS 27), on the #103 build:** sign-in, receipts, layout, prices hidden, month picker. **Not yet tested:**
- downloads (#106/#107);
- a real iPhone;
- offline (Airplane mode);
- the Firm portal "Join" link.

## Open problem (start here)

**Xcode window: "Missing package product 'splash-screen_CapacitorSplashScreen.CapacitorSplashScreen'"** (2026-11-07). Diagnosed on the founder's Mac (Xcode 27.2, Swift 6.4.2, Node 25):
- `swift package resolve` in `ios/App/CapApp-SPM` and `xcodebuild -resolvePackageDependencies` both resolve all three packages without error.
- `xcodebuild … -destination 'generic/platform=iOS Simulator' build` → **BUILD SUCCEEDED**, so the #106/#107 Swift compiles.
- So the project is fine; only the Xcode window fails.
- **Root cause of the full-screen PDF (found 2026-11-07 from the `ios:run` log, no `[UnReceipt] native code loaded` line):** `SceneDelegate.swift` set `CAPBridgeViewController()` as the root screen, so `AppViewController` never ran and NavigationGuard, Downloads and the safety net were never registered, since #103. Fixed: `AppViewController()`, guarded by `src/lib/__tests__/ios-shell.test.ts`. (The earlier "old build" explanation was wrong.)

**Workaround in place:** `npm run ios:run` (`scripts/ios-run.mjs`) builds with xcodebuild, installs over the old build and opens the app with its log in Terminal; `--clean` clears the package caches. Native code now logs `[UnReceipt] …` lines (downloads, safety net). Next: founder runs `npm run ios:run`, tests Download PDF, sends the `[UnReceipt]` lines. The Xcode window is still needed for a real iPhone and for TestFlight uploads; if it still fails after `--clean`, consider replacing `@capacitor/splash-screen` (the only local-path package) with an app-local splash plugin.

## Next work (plan steps in `docs/plans/unreceipt-store-apps-plan.md`)

1. Get downloads verified on the Simulator: Download PDF → share sheet → Save to Files; export ZIP; Download original; still signed in afterwards.
2. Founder: commit `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` after a successful build.
3. B5: document scanner in Swift (VisionKit `VNDocumentCameraViewController`) as an app-local plugin like `DownloadsPlugin`, feeding the existing `CaptureDialog` → `/api/ocr` flow.
4. Push notifications (B8), then the share extension (B7). Both need the paid Apple account.
5. Android later (founder's decision: iOS first).

## Founder context

- **Company and accounts:** no company yet, so no D-U-N-S number. Plan: Apple Developer as an individual (99 USD) for TestFlight when needed, then convert to an organization once the AB exists. The founder has a free Apple account, not paid. Google Play comes later.
- **Production data:** the founder's Gmail account owns a company with 1 receipt (Oct 14, 1,217 kr). It is also the **pending** admin invite of the only firm (`firm_members.user_id` is NULL), so Settings shows "Join <firm>". Don't test account deletion with this account.
- **Merging:** the founder authorised merging PRs once CI is green ("I let you merge everything").

## Constraints that bit last session

- **Can't compile Swift here.** Claude runs on Linux: Swift can't be compiled and Xcode can't run. Every native change is first compiled by the founder in Xcode, so say so plainly.
- **No history rewrites.** Force-push and rebase-rewrite of pushed branches are blocked by the permission classifier. Start each change on a **new branch from `origin/main`**, or merge `main` into a branch.
- **Before committing:** run `security-reviewer` (and `design-reviewer` for UI). Don't commit around a HIGH finding.
- **Network:** this container can't reach `unreceipt.com`. Use the Vercel MCP (`web_fetch_vercel_url`, `get_runtime_errors`, `list_deployments`) and the Supabase MCP for read-only checks.
