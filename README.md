# Where's the Damn Download?

A browser extension for people who were sent to a GitHub repository to
"download the program" and found a wall of files named
`MyApp-4.2.1-x86_64-pc-windows-msvc.zip`.

On a repository's page it detects your operating system and processor, reads
the repository's GitHub Releases, and points at the file you most likely need:

> **Recommended download for this computer**
> Detected: Windows 64-bit · Latest stable release: v4.2.1
> **MyApp-4.2.1-setup-win64.exe** — Windows installer · 84.2 MB
> **Download** · Why this file? · Other downloads

It is just as willing to say "there is no ready-to-run Windows build here", or
"this repository doesn't publish releases", because a confident wrong answer
is worse than none. The recommendation is about file compatibility, not a
security review of the project.

_Screenshots: `docs/screenshot-home.png`, `docs/screenshot-release.png` (to be
added)._

## Browsers and platforms

- Chrome and Chromium browsers (Manifest V3, service worker).
- Firefox desktop 140+ (Manifest V3, event page).
- Windows is fully supported (x64, ARM64, 32-bit, installer vs portable
  preference, overrides). macOS and Linux have baseline rules and fixtures;
  claims there stay conservative.

## Using it

Visit any public repository on github.com. The panel appears above the
repository content on the home page, the releases list, and individual release
pages. Open **Other downloads** to see every file with a one-line reason, and
tick **Advanced details** for the classifier's evidence. Overrides for OS,
architecture and package preference live in the panel and on the options page
(click the toolbar icon).

Nothing is downloaded until you click the link yourself.

## Development

```sh
npm install
npm test            # vitest: classifier fixtures, API mocks, jsdom UI
npm run typecheck   # tsc --noEmit
npm run build       # dist/firefox and dist/chrome
npm run lint        # web-ext lint on the Firefox build
npm run package     # zips for both stores in web-ext-artifacts/
npm start           # Firefox with the dev build, opened on github.com
npm run icons       # regenerate icons/ from tools/icons.mjs
```

Load unpacked: Chrome → `chrome://extensions` → Developer mode → Load
unpacked → `dist/chrome`. Firefox → `about:debugging#/runtime/this-firefox` →
Load Temporary Add-on → `dist/firefox/manifest.json`.

`npm run build:dev` turns on diagnostic logging (`__DEV__`) and inline source
maps.

## Layout

- `src/domain` — the pure classifier. No browser, no network, no clock.
  See [CLASSIFIER.md](CLASSIFIER.md).
- `src/github` — URL parsing, API client, response validation.
- `src/storage` — settings (sync) and release cache (local).
- `src/background` — the only place that talks to api.github.com.
- `src/content`, `src/ui` — page detection, navigation survival, the panel.
- `tests/` — Vitest suites; fixtures in `tests/fixtures/`.
- `tools/build.mjs` — esbuild + manifest derivation. See
  [ARCHITECTURE.md](ARCHITECTURE.md).

## Limitations (0.1)

- Public repositories on github.com only. No GitHub Enterprise, no private
  repositories, no authentication.
- Unauthenticated GitHub API: 60 requests per hour per IP. The cache keeps
  ordinary browsing well under that; a "limit reached" state appears otherwise.
- Architecture detection reports the browser's architecture. An x64 browser on
  an ARM machine (Rosetta, Windows on ARM) reads as x64 — use the override.
- Release notes are not shown.

## Contributing

Add a failing fixture before changing a rule: asset cases in
`tests/*.test.ts`, whole releases in `tests/fixtures/repository-cases/`. Keep
weights in `src/domain/rules.ts` and copy in `src/ui/strings.ts`. Run
`npm test && npm run typecheck && npm run build && npm run lint` before
opening a pull request.

## Privacy and licence

See [PRIVACY.md](PRIVACY.md). Licensed under the MPL-2.0. Not affiliated with
or endorsed by GitHub.
