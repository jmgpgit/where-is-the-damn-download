# Contributing

The most useful report is "this release, this computer, and it pointed at the
wrong file" — or pointed at nothing while a perfectly good download sat there.
That is how this extension fails, and every such case becomes a fixture.

## What this extension will not do

Five promises decide what belongs here. A patch that crosses one is declined
however well it is written.

**1. It never downloads or runs anything.** The panel renders an ordinary link
to a github.com asset URL and the reader clicks it. No `downloads` permission,
no fetching an asset to look inside it, no click on the reader's behalf, no
"start the installer for me". The whole extension is a recommendation and a
link.

**2. Compatibility is not a safety judgement.** The classifier answers "will
this file run on this computer", and nothing else. No feature may imply that a
file is safe, trusted, verified or clean — no tick, no shield, no reputation
score, no presenting a checksum or signature as evidence of trustworthiness
(the digest is metadata, not a verdict). `DISCLAIMERS.compatibility` in
`src/ui/strings.ts` says so in the panel, and it stays visible.

**3. Nothing leaves the device.** `api.github.com` is the only host contacted,
unauthenticated, for release metadata about the repository already open in the
tab. No server of ours, no analytics, no telemetry, no crash reporting, no
tokens, no sign-in, no third-party script, font or stylesheet. Everything that
runs ships in the package. Settings live in `storage.sync`, the release cache
in `storage.local`, and both are described claim by claim in `PRIVACY.md`.

**4. The smallest permission set that works.** Today: `storage`, host access to
`https://api.github.com/*`, and one content script on `https://github.com/*`.
Adding to that is not a code change — it changes `PRIVACY.md` and the
justification text at both stores, and a reviewer will ask why the feature
cannot exist without it. Have the answer first.

**5. Never obstruct or break GitHub's own page.** The panel goes in at one
known anchor as its first child, inside a shadow root so nothing leaks either
way. `ANCHOR_SELECTORS` in `src/content/mount.ts` is the whole list; if none of
them matches, `mountPanel` returns null and the extension does nothing. That is
the correct behaviour, not a bug to work around — GitHub moves its markup, and
an extension that guesses at a new insertion point breaks a page that was
working. Never move, cover, restyle or remove anything GitHub rendered.

The panel is the only shadow root, not the only footprint. On release pages
`src/content/source-archive-annotation.ts` writes into GitHub's light DOM: it
inserts one `<span>` of our own beside each source-archive link. The same rule
holds there, tighter — add our element and nothing else, never touch the link
or anything around it, and identify by URL structure only. If a link cannot be
identified with certainty, annotate nothing.

## Adding or changing a classifier rule

**The failing fixture comes first.** A rule tuned until the one case you have
in mind passes is how the other forty regress. Pick whichever fits:

- **One asset.** A case in the relevant suite: `tests/scoring.test.ts`,
  `tests/role-detection.test.ts`, `tests/hard-exclusions.test.ts`,
  `tests/tokenizer.test.ts`.
- **A whole release.** A JSON file in `tests/fixtures/repository-cases/`, for
  when the bug is about how assets rank against each other rather than about
  one filename.
- **A real release.** `npm run probe -- owner/repo --save` classifies the
  repository's latest release for Windows, macOS and Linux, prints what the
  classifier saw, and writes `tests/fixtures/real-world/owner--repo.json`. Add
  the expectations — minimum confidence, what must and must not be picked — to
  `tests/real-world.test.ts`. A real release is worth more than an invented
  one; maintainers name files in ways nobody would think to invent.

Then tune. **Weights, thresholds and token tables live in
`src/domain/rules.ts`** — the scoring code in `src/domain/scoring.ts` reads
them and should rarely need changing. `CLASSIFIER.md` explains what each weight
is for.

**`tests/invariants.test.ts` must stay green.** It holds the properties that
are true of every release, not just the one you are looking at: popularity
never outranks incompatibility, a checksum or signature is never the
recommendation, an exclusion always has an explanation. If a change needs an
invariant loosened, the invariant is the thing to discuss — open an issue for
it rather than editing the assertion.

Panel wording is in `src/ui/strings.ts`, all of it in one place. Beginner
language: no scores, no jargon, no safety claims.

## Where things belong

- **`src/domain`** is pure and must stay pure. No browser API, no network, no
  DOM, no `Date.now()`. Platform, preferences and the asset list arrive as
  arguments. That is what makes the classifier testable without a browser and
  its answers reproducible; reaching for anything ambient is a design bug, not
  a shortcut.
- **`src/github`** — URL parsing, the API client, and validation of GitHub's
  JSON, which is treated as untrusted: an asset whose download URL is not
  `https://github.com/<owner>/<repo>/releases/download/…` is dropped.
- **`src/storage`** — settings (sync) and the release cache (local), both
  versioned envelopes.
- **`src/background`** — the only place that calls `api.github.com`. Content
  scripts send identifiers and get an answer back; they never fetch.
- **`src/content`, `src/ui`** — page detection, surviving GitHub's
  client-side navigation, and the shadow-DOM panel.

[ARCHITECTURE.md](ARCHITECTURE.md) has the layer rules and the message flow;
[CLASSIFIER.md](CLASSIFIER.md) has the scoring model.

## Running everything

Node 20 or newer.

```sh
npm install
npm test                    # 531 vitest cases, no browser needed
npm run typecheck           # tsc --noEmit
npm run build               # esbuild -> dist/firefox and dist/chrome
npm run lint                # web-ext lint on the Firefox build; keep it at zero
npm start                   # Firefox with the extension loaded
npm start -- --chrome       # the same in Chrome
npm run probe -- owner/repo # what the classifier makes of a real release
```

`npm start` keeps a profile in `.dev-profile/` so a GitHub login and the
extension's settings survive between launches, and rebuilds as you edit `src/`.

Run all four of `test`, `typecheck`, `build` and `lint` before opening a pull
request, in that order. `build` earns its place twice over: it derives both
browsers' manifests from `manifest.src.json` and refuses a source manifest that
has stopped being Firefox-first, and `lint` reads `dist/firefox`, so a stale
build means you linted the previous change.

## Commits

- **Typed subjects**: `feat:`, `fix:`, `refactor:`, `perf:`, `test:`, `docs:`,
  `chore:`, lowercase after the colon. Pick the type by what a reader gets, not
  by which files moved — `feat:` only when something new is usable.
- **No `Co-Authored-By` trailer**, on anything.
- The version in `manifest.src.json`, `package.json` and `package-lock.json`,
  and the `CHANGELOG.md` entry, move together in the release commit at the end
  of a branch — not in each feature's own commit. The exception: a claim in
  `PRIVACY.md` that your commit makes untrue is corrected in that same commit,
  or the tree says something false about what the code does.
