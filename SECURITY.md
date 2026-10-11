# Security Policy

## Supported versions

Only the latest version gets security fixes:

| Version | Supported |
| --- | --- |
| Latest `main` (the live web app at https://jbmullican.github.io/ww2-battle-odds/) | Yes |
| Latest TestFlight build | Yes |
| Anything older | No |

## Reporting a vulnerability

Please report security problems **privately**. **Do not open a public issue, pull request, or discussion** for a security problem.

Use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab and click **Report a vulnerability**, or open https://github.com/jbmullican/ww2-battle-odds/security/advisories/new directly.
2. Describe the problem, how to reproduce it, and what an attacker could do with it.

Only the maintainer can see the report.

## What to expect

WW2 Battle Odds is a free hobby project with one maintainer, so responses are best effort. I'll try to acknowledge reports within a couple of weeks and fix confirmed problems as time allows. There is no bug bounty. If you'd like credit, say so in your report, and I'll be glad to credit you in the advisory once a fix is out.

## Scope

- The app runs entirely on your device. There is no server, no backend, and no user accounts. Saved battle setups stay in the browser's local storage on that device.
- **Count from photo** analyzes photos on the device. Photos are never uploaded.
- The web app is static files served by GitHub Pages. The iOS app is a thin native wrapper that serves the same files from inside the app bundle.
- The App Store Connect secrets used to build the iOS app are stored only in a protected GitHub environment that requires the owner's approval. Pull requests and forks never get them.

In scope: problems in this repository's code or build workflow, such as script injection in the web app, or a way to get the build workflow to leak secrets or publish an unapproved build.

Out of scope: problems in GitHub, GitHub Pages, Apple's TestFlight, or iOS themselves (please report those to GitHub or Apple), and the game-rule accuracy of the odds (open a normal issue for that).
