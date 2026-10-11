# WW2 Battle Odds

A free, unofficial battle odds calculator and dice roller for World War II strategy board games, compatible with Axis & Allies 1942 Second Edition.

Live app: https://jbmullican.github.io/ww2-battle-odds/

## iOS app

The same web app also ships as a native iPhone app (iOS 17+, iPhone only) through TestFlight. The iOS project lives in `ios/`; the web files stay at the repo root so GitHub Pages keeps working.

- `ios/project.yml` is an [XcodeGen](https://github.com/yonaskolb/XcodeGen) spec. The Xcode project is generated on GitHub's macOS runners, so no Mac is needed.
- The app is a SwiftUI shell with a `WKWebView`. At build time a script copies `index.html`, `manifest.webmanifest`, `css/`, `js/` and `icons/` into the app bundle, and the app serves them over a private `app://local/` scheme, so it works fully offline. The service worker is skipped inside the app.
- `ios/scripts/make_app_icon.py` redraws the die icon at 1024x1024 for the App Store icon.

### TestFlight workflow

`.github/workflows/ios-testflight.yml` runs on every push to `main` that changes the web or iOS files, and can be started by hand from **Actions > iOS TestFlight > Run workflow**. It runs the engine tests, does an unsigned compile check, then archives with automatic signing and uploads the build to App Store Connect. The version is 1.0 and the build number is the workflow run number.

Uploads only run when the owner starts the workflow by hand on `main` and approves the protected `testflight` environment. Pushes run only the tests and an unsigned compile check, which use no secrets. The secrets live only in that environment (**Settings > Environments > testflight**):

| Secret | What it is |
| --- | --- |
| `ASC_KEY_ID` | Key ID of the App Store Connect API key |
| `ASC_ISSUER_ID` | Issuer ID shown on the App Store Connect API keys page |
| `ASC_KEY_P8` | Full contents of the downloaded `AuthKey_XXXXXXXXXX.p8` file, including the BEGIN/END lines |
| `APPLE_TEAM_ID` | Your 10-character Apple Developer Team ID |

Without them the upload job stops at its first step with a list of the missing secrets. Every third-party action is pinned to a full commit SHA, and the repository only allows GitHub-owned actions plus `maxim-lobanov/setup-xcode`. The app record in App Store Connect must use the bundle ID `com.jbmullican.ww2battleodds`.

## Disclaimer

WW2 Battle Odds is an unofficial, free fan tool. It is not sold or monetized in any way. It is not affiliated with, sponsored by, or endorsed by Hasbro, Avalon Hill, or Wizards of the Coast. Axis & Allies is a trademark of Hasbro, Inc. and is mentioned only to describe compatibility. This project contains no game art, logos, or rulebook text.
