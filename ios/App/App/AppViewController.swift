import UIKit
import Capacitor

/// The screen that hosts the website (set as the custom class in
/// Main.storyboard). Its only job for now: register UnReceipt's own native
/// plugins, which live in this target instead of an npm package.
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NavigationGuardPlugin())
    }
}
