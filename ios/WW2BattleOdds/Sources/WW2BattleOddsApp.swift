// WW2 Battle Odds. Copyright (C) 2026 jbmullican. Licensed under GPL-3.0-or-later; see LICENSE.
import SwiftUI

@main
struct WW2BattleOddsApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    var body: some View {
        ZStack {
            Color(uiColor: .appBackground).ignoresSafeArea()
            // The web app already pads itself with env(safe-area-inset-*) (viewport-fit=cover),
            // so the web view runs edge to edge and CSS handles the notch and home indicator.
            BundledWebView().ignoresSafeArea()
        }
        .preferredColorScheme(.dark) // the web UI is dark-only; keeps the status bar text light
    }
}

extension UIColor {
    /// Matches --bg / theme-color #14171c in the web app.
    static let appBackground = UIColor(red: 20 / 255, green: 23 / 255, blue: 28 / 255, alpha: 1)
}
