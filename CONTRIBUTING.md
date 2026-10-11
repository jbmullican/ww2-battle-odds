# Contributing

Thanks for your interest in WW2 Battle Odds! Contributions are welcome through pull requests.

## How to contribute

1. Fork the repository and create a branch.
2. Make your change. The web app is plain HTML, CSS, and JavaScript with no build step; open `index.html` through any local web server to try it.
3. Run the engine tests: `node tests/engine.test.js`.
4. Open a pull request against `main`.

Every pull request must pass the required checks (**Engine tests (Node)** and **iOS compile check (unsigned)**) plus CodeQL code scanning before it can be merged. Pull requests are squash-merged.

Please keep the project free of game art, logos, rulebook text, and anything that would make it look official. It is an unofficial fan tool and must stay that way.

## License of contributions

By submitting a contribution, you agree that:

1. your contribution is licensed under the **GNU General Public License v3.0 or later** (GPL-3.0-or-later), the same license as the project; and
2. you grant **jbmullican** permission to distribute your contribution as part of the app through Apple's TestFlight and App Store, whose terms of service may add restrictions beyond those of the GPL.

You also confirm that you have the right to submit the contribution under these terms.

## Security issues

Do not open public issues or pull requests for security problems. Follow [SECURITY.md](SECURITY.md) and report them privately.
