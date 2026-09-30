import SwiftUI
import WebKit
import AVFAudio

@main
struct IsolationApp: App {
    var body: some Scene {
        WindowGroup {
            IsolationView()
                .background(Color(red: 5 / 255, green: 6 / 255, blue: 8 / 255))
                .preferredColorScheme(.dark)
        }
    }
}

struct IsolationView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> IsolationController { IsolationController() }
    func updateUIViewController(_ controller: IsolationController, context: Context) {}
}

final class IsolationController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {
    private var webView: WKWebView!
    private let smokeTest = ProcessInfo.processInfo.arguments.contains("--smoke-test")

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 5 / 255, green: 6 / 255, blue: 8 / 255, alpha: 1)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController.addUserScript(WKUserScript(
            source: "window.ISOLATION_IOS = true;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if smokeTest {
            configuration.userContentController.add(self, name: "smoke")
            if let url = Bundle.main.url(forResource: "native-smoke", withExtension: "js"),
               let script = try? String(contentsOf: url, encoding: .utf8) {
                configuration.userContentController.addUserScript(WKUserScript(
                    source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
            }
        }
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.backgroundColor = view.backgroundColor
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            NSLog("Isolation audio session: %@", error.localizedDescription)
        }
        loadApp()
    }

    private func loadApp() {
        guard let root = Bundle.main.url(forResource: "Web", withExtension: nil) else {
            showError("The bundled app is missing. Please reinstall this build.")
            return
        }
        var components = URLComponents(url: root.appendingPathComponent("index.html"), resolvingAgainstBaseURL: false)!
        if smokeTest { components.fragment = "debug" }
        webView.loadFileURL(components.url!, allowingReadAccessTo: root)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showError(error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showError(error.localizedDescription)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    private func showError(_ message: String) {
        if smokeTest { writeSmokeReport(["status": "failed", "error": message]); return }
        let alert = UIAlertController(title: "Unable to open Isolation", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Retry", style: .default) { [weak self] _ in self?.loadApp() })
        present(alert, animated: true)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard smokeTest, message.name == "smoke", let report = message.body as? [String: Any] else { return }
        writeSmokeReport(report)
    }

    private func writeSmokeReport(_ report: [String: Any]) {
        do {
            let url = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask,
                                                 appropriateFor: nil, create: true).appendingPathComponent("native-smoke.json")
            try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: url, options: .atomic)
        } catch { NSLog("Isolation smoke report: %@", error.localizedDescription) }
    }
}
