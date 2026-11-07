import UIKit
import WebKit
import Capacitor

/// Keeps exactly one site inside the app: the server it was built for
/// (app.unreceipt.com, or the dev server from CAP_SERVER_URL). Every other
/// page opens in Safari.
///
/// Why: every page the web view shows gets the native bridge
/// (window.Capacitor and all plugins). Capacitor decides "inside the app"
/// with a plain string prefix on server.url, so a look-alike address such as
/// https://app.unreceipt.com.evil.com or https://app.unreceipt.com@evil.com
/// would stay inside the app with that bridge. This compares the real host,
/// scheme and port instead. Capacitor asks every plugin before its own check
/// (WebViewDelegationHandler), so this runs first.
@objc(NavigationGuardPlugin)
public class NavigationGuardPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NavigationGuardPlugin"
    public let jsName = "NavigationGuard"
    public let pluginMethods: [CAPPluginMethod] = []

    /// nil = let Capacitor decide as usual; true = cancel the load here.
    override public func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        guard let url = navigationAction.request.url,
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else {
            // capacitor:// (the bundled offline page), about:blank, mailto:, …
            return nil
        }
        // Only whole-page loads. Frames inside our own page (the receipt's PDF
        // preview from Supabase storage) keep Capacitor's default handling.
        if let frame = navigationAction.targetFrame, !frame.isMainFrame {
            return nil
        }
        guard let server = bridge?.config.serverURL else { return nil }
        if Self.isSameSite(url, as: server) {
            return nil
        }
        // Somewhere else: never inside the app.
        DispatchQueue.main.async {
            UIApplication.shared.open(url)
        }
        return true
    }

    static func isSameSite(_ url: URL, as server: URL) -> Bool {
        guard url.scheme?.lowercased() == server.scheme?.lowercased(),
              let host = url.host?.lowercased(),
              host == server.host?.lowercased(),
              url.user == nil, url.password == nil else {
            return false
        }
        return effectivePort(url) == effectivePort(server)
    }

    private static func effectivePort(_ url: URL) -> Int? {
        if let port = url.port { return port }
        switch url.scheme?.lowercased() {
        case "https": return 443
        case "http": return 80
        default: return nil
        }
    }
}
