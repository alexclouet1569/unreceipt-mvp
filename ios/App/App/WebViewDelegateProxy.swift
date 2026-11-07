import Foundation
import WebKit

/// Sits in front of Capacitor's web view navigation delegate
/// (WebViewDelegationHandler, which the app can't replace) and passes
/// everything through to it, except two things:
///
/// 1. A file about to be shown as a whole page (a receipt PDF, a ZIP, an
///    image) is cancelled and handed to the Downloads share sheet. The web
///    view has no back button, so a PDF shown full screen left the user
///    stuck. The website normally routes downloads itself
///    (src/app/_native-app-bridge.tsx); this is the safety net for when that
///    didn't run.
/// 2. A load that was cancelled on purpose (by (1), or superseded by a newer
///    tap) is not an error while a page is on screen. Capacitor shows the
///    offline page for every failed load, which would put "Can't reach
///    UnReceipt" on screen for no reason.
///
/// Known side effect: Capacitor resets the bridge when a load starts
/// (didStartProvisionalNavigation → bridge.reset(), which drops plugin
/// listeners and saved calls), before anyone can know the load is a file.
/// After (1) the page stays but its listeners are gone. Nothing registers
/// listeners today; a plugin that does (scanner, push) must re-register them
/// when the page becomes visible again.
final class WebViewDelegateProxy: NSObject, WKNavigationDelegate {
    private let original: WKNavigationDelegate
    private let onDownload: (URL) -> Void

    init(original: WKNavigationDelegate, onDownload: @escaping (URL) -> Void) {
        self.original = original
        self.onDownload = onDownload
    }

    // Everything this class doesn't implement goes to Capacitor's handler.
    // WebKit asks once, when the delegate is set, which methods exist.
    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || original.responds(to: aSelector)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        original.responds(to: aSelector) ? original : super.forwardingTarget(for: aSelector)
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if navigationResponse.isForMainFrame,
           let url = navigationResponse.response.url,
           Self.isFile(navigationResponse.response) {
            decisionHandler(.cancel)
            onDownload(url)
            return
        }
        // Capacitor doesn't implement this today; if it ever does, it decides.
        // nil means it isn't implemented, and WebKit needs an answer.
        if original.webView?(webView, decidePolicyFor: navigationResponse, decisionHandler: decisionHandler) == nil {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if Self.isDeliberateCancel(error) && Self.hasPage(webView) { return }
        original.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if Self.isDeliberateCancel(error) && Self.hasPage(webView) { return }
        original.webView?(webView, didFail: navigation, withError: error)
    }

    /// A page is on screen. When the very first load is the one cancelled
    /// (e.g. the start page redirected off-host), there is nothing to stay
    /// on, so Capacitor's offline page must still show.
    private static func hasPage(_ webView: WKWebView) -> Bool {
        webView.backForwardList.currentItem != nil
    }

    /// Something to save, not a page: sent as an attachment, or a file type.
    static func isFile(_ response: URLResponse) -> Bool {
        if let http = response as? HTTPURLResponse,
           let disposition = http.value(forHTTPHeaderField: "Content-Disposition"),
           disposition.lowercased().hasPrefix("attachment") {
            return true
        }
        let mime = (response.mimeType ?? "").lowercased()
        return mime == "application/pdf" || mime == "application/zip"
            || mime == "application/octet-stream" || mime == "message/rfc822"
            || mime.hasPrefix("image/")
    }

    /// NSURLErrorCancelled (a newer load replaced this one) or WebKit's
    /// "frame load interrupted" (a policy cancelled it, as above).
    static func isDeliberateCancel(_ error: Error) -> Bool {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return true }
        return nsError.domain == "WebKitErrorDomain" && nsError.code == 102
    }
}
