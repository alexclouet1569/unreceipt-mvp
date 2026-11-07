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
///   - our Supabase project's Storage over https (originals and exports):
///     short-lived signed links that get no cookies. The host is
///     `plugins.Downloads.storageHost` in capacitor.config.ts.
/// A redirect must stay with the same kind of address, so the cookies never
/// follow a redirect to another host. Anything else is refused.
@objc(DownloadsPlugin)
public class DownloadsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DownloadsPlugin"
    public let jsName = "Downloads"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise)
    ]

    private static var downloadsFolder: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("downloads", isDirectory: true)
    }

    /// Why a download didn't happen, with the code the website reads
    /// (src/app/_native-app-bridge.tsx: only DOWNLOAD_FAILED blames the
    /// connection).
    enum Failure: String, Error {
        case invalidURL = "INVALID_URL"
        case hostNotAllowed = "HOST_NOT_ALLOWED"
        case downloadFailed = "DOWNLOAD_FAILED"
        case saveFailed = "SAVE_FAILED"
        case noView = "NO_VIEW"

        var message: String {
            switch self {
            case .invalidURL: return "Invalid download address."
            case .hostNotAllowed: return "This address can't be downloaded in the app."
            case .downloadFailed: return "The download didn't work. Check your connection and try again."
            case .saveFailed: return "The file couldn't be saved on the phone."
            case .noView: return "The share sheet couldn't open."
            }
        }
    }

    /// From the website: `Downloads.share({ url, filename })`.
    @objc func share(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw) else {
            call.reject(Failure.invalidURL.message, Failure.invalidURL.rawValue)
            return
        }
        download(url, filename: call.getString("filename")) { result in
            switch result {
            case .success(let completed): call.resolve(["completed": completed])
            case .failure(let failure): call.reject(failure.message, failure.rawValue)
            }
        }
    }

    /// Fetches `url` and opens the share sheet. Also called natively by
    /// WebViewDelegateProxy when a file was about to replace the page.
    /// `done` reports whether the user completed a share action.
    func download(_ url: URL, filename requested: String?, done: @escaping (Result<Bool, Failure>) -> Void) {
        guard let server = bridge?.config.serverURL else {
            done(.failure(.invalidURL))
            return
        }
        let storageHost = getConfig().getString("storageHost")?.lowercased()
        let ownServer = NavigationGuardPlugin.isSameSite(url, as: server)
        guard ownServer || Self.isStorage(url, host: storageHost) else {
            done(.failure(.hostNotAllowed))
            return
        }
        // Redirects stay in the same lane: a request that carries the
        // session cookies may only be redirected to our own server, and a
        // storage link only to storage.
        let allowed: (URL) -> Bool = ownServer
            ? { NavigationGuardPlugin.isSameSite($0, as: server) }
            : { Self.isStorage($0, host: storageHost) }

        // A file left by a share sheet the app was killed under goes now.
        try? FileManager.default.removeItem(at: Self.downloadsFolder)

        let start = { (cookies: [HTTPCookie]) in
            var request = URLRequest(url: url)
            request.timeoutInterval = 120
            // The cookies are set by hand, only on this request: the session
            // keeps no cookie store of its own (see makeSession).
            request.httpShouldHandleCookies = false
            if ownServer {
                for (name, value) in HTTPCookie.requestHeaderFields(with: cookies) {
                    request.setValue(value, forHTTPHeaderField: name)
                }
            }
            let guardDelegate = RedirectGuard(allowed: allowed)
            let session = Self.makeSession(delegate: guardDelegate)
            session.downloadTask(with: request) { tempURL, response, error in
                defer { session.finishTasksAndInvalidate() }
                guard error == nil, let tempURL = tempURL,
                      let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                    done(.failure(.downloadFailed))
                    return
                }
                let name = Self.safeFilename(requested ?? response?.suggestedFilename)
                let folder = Self.downloadsFolder.appendingPathComponent(UUID().uuidString, isDirectory: true)
                let fileURL = folder.appendingPathComponent(name)
                do {
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    try FileManager.default.moveItem(at: tempURL, to: fileURL)
                } catch {
                    try? FileManager.default.removeItem(at: folder)
                    done(.failure(.saveFailed))
                    return
                }
                // Our server may have renewed the sign-in in this response
                // (proxy.ts refreshes it on every request). Hand the new
                // cookies to the web view, or it keeps the refresh token that
                // was just used up and the user is signed out later.
                let renewed = ownServer ? Self.cookies(from: http, for: url) : []
                DispatchQueue.main.async {
                    self.store(renewed) {
                        self.presentShareSheet(for: fileURL, folder: folder, done: done)
                    }
                }
            }.resume()
        }

        // Cookies live in the web view's store, which must be read on the
        // main thread; only the app's own server gets them.
        DispatchQueue.main.async {
            guard ownServer, let store = self.bridge?.webView?.configuration.websiteDataStore.httpCookieStore else {
                start([])
                return
            }
            store.getAllCookies { all in
                start(all.filter { Self.cookie($0, appliesTo: url) })
            }
        }
    }

    /// A session with no cookie store and no cache: nothing it receives is
    /// kept outside the web view's own store, and no file stays in a cache.
    private static func makeSession(delegate: URLSessionTaskDelegate) -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.urlCache = nil
        return URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
    }

    private func store(_ cookies: [HTTPCookie], then done: @escaping () -> Void) {
        guard !cookies.isEmpty, let store = bridge?.webView?.configuration.websiteDataStore.httpCookieStore else {
            done()
            return
        }
        let group = DispatchGroup()
        for cookie in cookies {
            group.enter()
            store.setCookie(cookie) { group.leave() }
        }
        group.notify(queue: .main, execute: done)
    }

    private func presentShareSheet(for fileURL: URL, folder: URL, done: @escaping (Result<Bool, Failure>) -> Void) {
        // Present from whatever is on top, so an open sheet or alert can't
        // make this silently do nothing and leave the page waiting.
        guard var presenter = bridge?.viewController else {
            try? FileManager.default.removeItem(at: folder)
            done(.failure(.noView))
            return
        }
        while let top = presenter.presentedViewController, !top.isBeingDismissed {
            presenter = top
        }
        let sheet = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
        sheet.completionWithItemsHandler = { _, completed, _, _ in
            // The file is only needed while the sheet is open.
            try? FileManager.default.removeItem(at: folder)
            done(.success(completed))
        }
        // Required on iPad (the app is iPhone-only, but iPads can run it).
        sheet.popoverPresentationController?.sourceView = presenter.view
        sheet.popoverPresentationController?.sourceRect = CGRect(
            x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY - 1, width: 1, height: 1)
        presenter.present(sheet, animated: true)
    }

    /// Our Supabase project's Storage: https, the configured host, /storage/.
    static func isStorage(_ url: URL, host storageHost: String?) -> Bool {
        guard let storageHost = storageHost, !storageHost.isEmpty,
              url.scheme?.lowercased() == "https", url.user == nil, url.password == nil,
              url.port == nil || url.port == 443,
              url.host?.lowercased() == storageHost else { return false }
        return url.path.hasPrefix("/storage/")
    }

    /// Cookie matching as a browser does it: domain, path, Secure, expiry.
    static func cookie(_ cookie: HTTPCookie, appliesTo url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        if let expires = cookie.expiresDate, expires < Date() { return false }
        if cookie.isSecure && url.scheme?.lowercased() != "https" { return false }
        var domain = cookie.domain.lowercased()
        let hostOnly = !domain.hasPrefix(".")
        if domain.hasPrefix(".") { domain.removeFirst() }
        let domainMatches = hostOnly ? host == domain : (host == domain || host.hasSuffix("." + domain))
        guard domainMatches else { return false }
        let path = url.path.isEmpty ? "/" : url.path
        let cookiePath = cookie.path.isEmpty ? "/" : cookie.path
        return path == cookiePath || path.hasPrefix(cookiePath.hasSuffix("/") ? cookiePath : cookiePath + "/")
    }

    /// The Set-Cookie headers of a response from our own server.
    static func cookies(from response: HTTPURLResponse, for url: URL) -> [HTTPCookie] {
        var fields: [String: String] = [:]
        for (key, value) in response.allHeaderFields {
            if let key = key as? String, let value = value as? String { fields[key] = value }
        }
        return HTTPCookie.cookies(withResponseHeaderFields: fields, for: url)
    }

    /// A plain file name: no folders, no hidden files, nothing empty, and
    /// short enough for the file system (255 bytes).
    static func safeFilename(_ raw: String?) -> String {
        let base = (raw ?? "").components(separatedBy: CharacterSet(charactersIn: "/\\:"))
            .last?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        var cleaned = String(base.drop(while: { $0 == "." }))
        while cleaned.utf8.count > 200 { cleaned.removeFirst() }
        return cleaned.isEmpty ? "UnReceipt-download" : cleaned
    }
}

/// Follows a redirect only to an address the download was allowed to use in
/// the first place. URLSession would otherwise copy the hand-set Cookie
/// header to wherever the redirect points.
private final class RedirectGuard: NSObject, URLSessionTaskDelegate {
    private let allowed: (URL) -> Bool

    init(allowed: @escaping (URL) -> Bool) {
        self.allowed = allowed
    }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        if let next = request.url, allowed(next) {
            completionHandler(request)
        } else {
            completionHandler(nil)
        }
    }
}
