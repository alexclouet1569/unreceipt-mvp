import UIKit
import Capacitor

/// The screen that hosts the website (set as the custom class in
/// Main.storyboard). Registers UnReceipt's own native plugins, which live in
/// this target instead of an npm package, and puts WebViewDelegateProxy in
/// front of Capacitor's navigation delegate.
class AppViewController: CAPBridgeViewController {
    // The web view holds its navigation delegate weakly.
    private var delegateProxy: WebViewDelegateProxy?

    override open func capacitorDidLoad() {
        let downloads = DownloadsPlugin()
        bridge?.registerPluginInstance(NavigationGuardPlugin())
        bridge?.registerPluginInstance(downloads)

        // Safety net: a file that was about to replace the page (no back
        // button in the app) goes to the share sheet instead.
        if let webView = webView, let original = webView.navigationDelegate {
            let proxy = WebViewDelegateProxy(original: original) { [weak downloads] url in
                downloads?.downloadFromPageLoad(url)
            }
            webView.navigationDelegate = proxy
            delegateProxy = proxy
        }
    }
}
