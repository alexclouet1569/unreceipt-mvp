import UIKit
import WebKit
import Capacitor

/// Downloads inside the app. The iOS web view ignores `<a download>`: a
/// receipt PDF would open full screen with no way back, and a Supabase file
/// would leave the app for Safari. The website (src/app/_native-app-bridge.tsx)
/// hands every download link to `Downloads.share({ url, filename })` instead;
/// this fetches the file and opens the iOS share sheet (Save to Files, Mail,
/// AirDrop, …).
///
/// Only two kinds of address are fetched:
///   - the app's own server (the receipt PDF), sent with the web view's
///     sign-in cookies for that host, because the route needs the session;
///   - Supabase Storage over https (originals and exports), which are
///     short-lived signed links and get no cookies.
/// Anything else is refused, so a page can't use this to fetch arbitrary
/// URLs with the user's cookies.
@objc(DownloadsPlugin)
public class DownloadsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DownloadsPlugin"
    public let jsName = "Downloads"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise)
    ]

    @objc func share(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw),
              let server = bridge?.config.serverURL else {
            call.reject("Invalid download address.", "INVALID_URL")
            return
        }
        let ownServer = NavigationGuardPlugin.isSameSite(url, as: server)
        guard ownServer || Self.isSupabaseStorage(url) else {
            call.reject("This address can't be downloaded in the app.", "HOST_NOT_ALLOWED")
            return
        }
        let requested = call.getString("filename")

        let start = { (cookies: [HTTPCookie]) in
            var request = URLRequest(url: url)
            request.timeoutInterval = 120
            if ownServer {
                for (name, value) in HTTPCookie.requestHeaderFields(with: cookies) {
                    request.setValue(value, forHTTPHeaderField: name)
                }
            }
            URLSession.shared.downloadTask(with: request) { tempURL, response, error in
                guard error == nil, let tempURL = tempURL,
                      let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                    call.reject("The download didn't work. Check your connection and try again.", "DOWNLOAD_FAILED")
                    return
                }
                let name = Self.safeFilename(requested ?? response?.suggestedFilename)
                let folder = FileManager.default.temporaryDirectory
                    .appendingPathComponent("downloads", isDirectory: true)
                    .appendingPathComponent(UUID().uuidString, isDirectory: true)
                let fileURL = folder.appendingPathComponent(name)
                do {
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    try FileManager.default.moveItem(at: tempURL, to: fileURL)
                } catch {
                    call.reject("The file couldn't be saved on the phone.", "SAVE_FAILED")
                    return
                }
                DispatchQueue.main.async {
                    self.presentShareSheet(for: fileURL, folder: folder, call: call)
                }
            }.resume()
        }

        // Cookies live in the web view's store, which must be read on the
        // main thread; only the app's own server gets them.
        DispatchQueue.main.async {
            guard ownServer, let store = self.bridge?.webView?.configuration.websiteDataStore.httpCookieStore,
                  let host = url.host?.lowercased() else {
                start([])
                return
            }
            store.getAllCookies { all in
                start(all.filter { Self.cookie($0, appliesTo: host) })
            }
        }
    }

    private func presentShareSheet(for fileURL: URL, folder: URL, call: CAPPluginCall) {
        guard let presenter = bridge?.viewController else {
            try? FileManager.default.removeItem(at: folder)
            call.reject("The share sheet couldn't open.", "NO_VIEW")
            return
        }
        let sheet = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
        sheet.completionWithItemsHandler = { _, completed, _, _ in
            // The file is only needed while the sheet is open.
            try? FileManager.default.removeItem(at: folder)
            call.resolve(["completed": completed])
        }
        // Required on iPad (the app is iPhone-only, but iPads can run it).
        sheet.popoverPresentationController?.sourceView = presenter.view
        sheet.popoverPresentationController?.sourceRect = CGRect(
            x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY - 1, width: 1, height: 1)
        presenter.present(sheet, animated: true)
    }

    /// Supabase Storage signed links: https on a *.supabase.co host.
    static func isSupabaseStorage(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https", url.user == nil, url.password == nil,
              let host = url.host?.lowercased() else { return false }
        return host.hasSuffix(".supabase.co") && url.path.hasPrefix("/storage/")
    }

    /// The standard cookie domain match: "app.unreceipt.com" or ".unreceipt.com".
    static func cookie(_ cookie: HTTPCookie, appliesTo host: String) -> Bool {
        var domain = cookie.domain.lowercased()
        if domain.hasPrefix(".") { domain.removeFirst() }
        return host == domain || host.hasSuffix("." + domain)
    }

    /// A plain file name: no folders, no hidden files, nothing empty.
    static func safeFilename(_ raw: String?) -> String {
        let base = (raw ?? "").components(separatedBy: CharacterSet(charactersIn: "/\\:"))
            .last?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let cleaned = String(base.drop(while: { $0 == "." }).prefix(120))
        return cleaned.isEmpty ? "UnReceipt-download" : cleaned
    }
}
