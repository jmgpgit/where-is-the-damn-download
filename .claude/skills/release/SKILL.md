---
name: release
description: Cut a release of the "Where's the Damn Download?" extension, or make any commit on it. Covers the doc sync, the panel-versus-options re-decision, the semver bump across manifest.src.json, package.json and package-lock.json, commit conventions, store-submissions/<version>.txt for both dashboards, and the source-code archive AMO requires because esbuild bundles. Use when committing, versioning, releasing, tagging, or preparing a Chrome Web Store or AMO upload.
---

# Releasing

A release is `README.md`, `ARCHITECTURE.md`, `CLASSIFIER.md`, `PRIVACY.md` and `CHANGELOG.md`
agreeing with the code, the panel controls re-decided, three version numbers bumped, and
`store-submissions/<version>.txt` written — in that order, and not until the checks in §4 pass and
it has been tested in a real browser.

The one thing that makes this extension harder to release than its sibling: **`tools/build.mjs`
runs esbuild with `bundle: true` and transpiles TypeScript.** AMO's build-tools question is
therefore Yes, and a source archive goes up with every AMO upload. See §6; it is the most likely
cause of a rejection here.

Where a rule exists because something went wrong, the reason is written down so it does not get
tidied away later.

## 1. Keep in sync

A feature is not finished until these agree with it:

- **`README.md`** — the feature list, the install section, and the "build from source" section
  (§6 depends on that section existing and being right).
- **`ARCHITECTURE.md`** — module boundaries, message flow, anything about where a decision is made.
- **`CLASSIFIER.md`** — the classifier is the product. A new token, role, exclusion or scoring
  change that is not written here is undocumented behaviour in the thing users are trusting.
- **`PRIVACY.md`** — must describe **every request the extension makes and everything it stores**.
  Today that is: GETs to `https://api.github.com` only (`/repos/{owner}/{repo}/releases/latest`,
  `/releases/tags/{tag}`, `/releases?per_page=15`), unauthenticated; settings in `storage.sync`
  under one versioned key; release metadata in `storage.local` (1h fresh, ≤7d stale, 20min
  negative, max 64 entries). A feature that adds a request or a storage key rewrites `PRIVACY.md`
  **in the same commit** — otherwise the tree says something false about what the code does, and
  the host-permission justification you paste into two dashboards is written from a stale file.
- **`CHANGELOG.md`** — one entry per released version.

Everything except the `PRIVACY.md` correction is brought into agreement in the release commit at
the end (§4), not in each feature's own commit.

## 2. Re-decided at every release

There is no popup. Two recurring decisions take its place, and nothing makes either of them
automatically.

**(a) In-panel controls versus the options page.** `src/ui/settings-controls.ts` carries a curated
subset of the settings — the overrides a visitor reaches for while looking at a release they came
to download. The options page carries the rest. Left alone, the panel slowly becomes whatever
mattered in 1.0 while the useful new override sits behind a click nobody makes on someone else's
repository page.

At each release, ask of every setting added since the last one: *would someone standing on a
release page, wrong download in front of them, reach for this right now?* If yes it belongs in the
panel. If it is set once and forgotten, options is the right home. Demotion counts: the panel is
inside an injected card on a page that is not ours, so adding usually means removing.

**(b) Did new classifier behaviour change what the panel says?** The copy lives in
`src/ui/strings.ts`, deliberately in one file. A new confidence level, a new hard exclusion, a new
role, a new empty state — each of those can leave the panel explaining the old rule. The claim in
the summary is that this extension is honest when there is nothing to download; that claim lives in
`strings.ts`, not in the classifier.

## 3. Version bump

- Semver: patch for fixes, minor for new settings or new classifier capability, major for anything
  that changes what an existing setting already does.
- A release bumps **`manifest.src.json`, `package.json` and `package-lock.json` together**. The
  lockfile is the one that gets forgotten: it records the version twice and only changes when
  `npm install` runs. The sibling extension shipped four releases with its lockfile still saying
  `1.0.0`. Edit `package.json`, then run `npm install` and commit the result — a two-line diff with
  no dependency change.
- A release adds a `CHANGELOG.md` entry under that version.
- `minimum_chrome_version` is `121` and the Chrome Web Store enforces it on install. Check at each
  release that it is still what you want.
- Do **not** lower `browser_specific_settings.gecko.strict_min_version` (`140.0`) or
  `gecko_android.strict_min_version` (`142.0`). They are load-bearing: `data_collection_permissions`
  needs Firefox 140 desktop / 142 Android, and since 3 November 2025 AMO **blocks the upload** of a
  new extension that does not declare it correctly. Not a review finding — a refused submission.
  `required: ["none"]` is already correct and there is no separate data-collection question in the
  Developer Hub; the manifest is the answer.

## 4. The commits

Commits go to `main` in this repo — that was the choice. Check `git status` before touching the
index, and drop files whose only change is line endings.

**Four commands must pass before the release commit**, all of which pass today:

```sh
npm test                                    # 531 Vitest tests
npm run typecheck
npm run build                               # emits dist/firefox and dist/chrome
npx web-ext lint --source-dir dist/firefox  # same as `npm run lint`
```

`web-ext lint` reads the build, not the source, so `npm run build` comes first, and the bar is **0
errors and 0 warnings** — a warning here is a finding the AMO reviewer sees too. When
`store-submissions/<version>.txt` exists, `node .claude/skills/release/check-fields.mjs
store-submissions/<version>.txt` (§5) passes as well. A real browser is still the last check, not
the only one.

- **Each part lands on its own commit, subject prefixed with a type**: `feat:`, `fix:`,
  `refactor:`, `perf:`, `test:`, `docs:`, `chore:`. Lowercase after the colon. Pick the type by what
  a reader gets, not by which files moved.
- **The release commit is last and is the only one that touches release files** —
  `manifest.src.json`, `package.json`, `package-lock.json`, the `CHANGELOG.md` entry and the doc
  sync. Feature commits leave those alone, so the changelog is written once from finished work.
  Exception: a `PRIVACY.md` claim a commit makes untrue is corrected in that commit.
- **A release commit's subject says what the release is about**, not just its number:
  `Release 1.0.0: tell people which download is theirs`, never a bare `Release 1.0.0`. The number is
  in the tag and the changelog already. It takes **no type prefix** — it is its own type.
- **Never a `Co-Authored-By` trailer.** On anything.
- `git commit -F -` reads a message from stdin; `git merge -F -` does not, and fails with
  `could not read file '-'`. Write the merge message to a file first.

## 5. Store submissions

Write `store-submissions/<version>.txt` when a release is actually going to a store, not on every
commit. Most releases never get submitted.

When it is written it holds every field both dashboards ask for, ready to paste:

- **Self-contained. Never refer to another release.** No "unchanged from 0.9.0", no "see the 1.0.0
  notes". Reproduce every field in full even when it has not changed, and mark it UNCHANGED. The
  version live on a store is rarely the one immediately before this, so "unchanged from" is both
  useless to whoever is pasting and, at a store, untrue.
- **Answer every field, including the ones with nothing to say.** Say "not applicable" and why.
- **Write the field text as continuous sentences and let it wrap.** No hard line breaks inside a
  paragraph or a bullet. Both dashboards take these into textareas that wrap for themselves, and a
  pre-wrapped paste keeps its breaks in the published listing at the wrong width. Blank lines
  between paragraphs and one line per bullet are meaning, and stay.
- **Count every field and state the count in its header line.** `approval_notes` is a Django
  `TextField` with `max_length`, enforced in the form but not in the database, which is how
  over-length text has gone in silently rather than being refused. Then run, before the release
  commit:

  ```sh
  node .claude/skills/release/check-fields.mjs store-submissions/<version>.txt
  ```

  It fails on a field over cap, a stated count that no longer matches its text, a field with no
  count, and hard-wrapped prose.

### Chrome Web Store fields

| Field | Cap | Notes |
|---|---|---|
| Item name | 75 | From the manifest `name`. 26 here. |
| Summary | 132 | **Is** the manifest `description` (114 here). Editing it is a release, not a listing edit. |
| Description | 16000 | Dashboard-enforced; Google's docs never state a number. Trust the field's counter. |
| Single purpose description | 1000 | Dashboard-observed cap. Policy wants "a single purpose that is narrow and easy to understand". |
| `storage` justification | 1000 | One box per manifest permission; `storage` is the only one. |
| Host permission justification | 1000 | Must cover **both** hosts — see below. |
| Remote code justification | 1000 | Answer **No**. Whether the box stays required has varied between dashboard revisions; have the sentence ready either way. |

Also on Chrome: category, language, optional homepage/support URLs, the privacy-policy URL on the
developer account page, and the two data-usage groups — **no data-type checkbox ticked** (no PII,
health, financial, authentication, personal communications, location, web history, user activity or
website content) and **all three Limited Use certifications ticked**.

Do **not** tick the Mature-content flag over the word "Damn". Chrome's mature policy covers nudity
and sexually explicit material and does not mention profanity anywhere; a mature item is shown only
to logged-in adult accounts and vanishes from search for everyone else. AMO has no content rating
and no profanity rule. What you must not do is soften the name on one store and not the other —
divergent listings are a written violation.

**The host justification is the one that gets questioned, and it is `https://github.com/*`, not
`api.github.com`.** Chrome builds its host list from `host_permissions` **and**
`content_scripts.matches`, so one box has to explain both. It must say:

- `https://api.github.com/*` — GET release metadata, **unauthenticated**: no token, no account, no
  header carrying anything about the user, cached (1h fresh, 7d stale, 20min negative, 64 entries)
  so ordinary browsing does not re-request. Say "unauthenticated" out loud. Left unstated, "the
  extension talks to an API" reads as telemetry.
- `https://github.com/*` — the content script. It cannot be narrowed: match patterns cannot express
  "two path segments", and `https://github.com/*/*` matches `/settings/tokens` exactly as well.
  Then say the content script returns immediately on any page that is not a repository or release
  page. Both stores have a least-privilege rule (Chrome: "the narrowest permissions necessary";
  AMO: "only request those permissions that are necessary"). That sentence is the difference
  between a clarification request and a rejection.

### AMO fields

**The first question in the flow is the distribution choice — "On this site" versus "On your own".**
A listed release is **On this site**. "On your own" means unlisted and is only ever the self-signed
build in §9; picked by mistake for the real release it puts the version somewhere the store never
shows, and the number is spent.

Caps are from addons-server's models, not from Chrome habits.

| Field | Cap | Notes |
|---|---|---|
| Name | 50 | 26 here. |
| Add-on URL / slug | 30 | |
| Summary | 250, min 10 | Pre-filled from the manifest description (114). AMO allows 250, Chrome only 132 — the manifest has to satisfy the tighter one. |
| Description | 15000, min 10 | **Not 16000.** That is Chrome's. Do not carry the habit over. |
| Release Notes | 3000 | The `CHANGELOG.md` entry as plain text. |
| Notes to Reviewer | 3000 | |
| Developer comments | 3000 | |
| Privacy policy | 150000 | |
| Screenshot caption | 280 each | |
| Categories | 2 Firefox + 2 Firefox for Android | |
| Tags | up to 10, from AMO's curated list | Not free text. |

Required to submit: name, summary, description, categories. Support URL and support email are
optional. Screenshots are optional on AMO (§7).

Since June 2025 Mozilla no longer requires a privacy policy hosted on AMO and encourages linking a
self-hosted one, so the GitHub `PRIVACY.md` URL is the right answer — **provided the repo is
actually public**. A dead link is strictly worse than no link.

**Notes to Reviewer must contain three things** beyond the usual:

1. **GitHub's rate limit can make a reviewer see nothing.** Unauthenticated requests are limited to
   60 per hour and are attributed to the originating IP; a reviewer on a shared or VPN'd address may
   open a release page and get an empty panel, then file it as broken. Describe what the
   rate-limited state looks like on screen and that the panel says so rather than failing silently.
2. **Two concrete test URLs** — one release with a clear per-OS asset, one with only a source
   tarball — so the honest "there isn't one" claim is testable rather than merely asserted.
3. **Why the two manifests differ.** Firefox has no extension service worker, so `manifest.src.json`
   keeps `background.scripts` and `tools/build.mjs` rewrites it to `background.service_worker` for
   Chrome and drops `browser_specific_settings`. The AMO reviewer reads the Firefox ZIP against a
   source archive whose `manifest.src.json` is already the Firefox manifest, so there are no
   Chrome-only keys to explain. One line removes the obvious question.

**Before either submission:** confirm `https://github.com/jmgpgit/where-is-the-damn-download` is pushed and
public, in a logged-out window. `manifest.src.json` sets it as `homepage_url` and the docs build the
privacy-policy URL from it. Nobody has confirmed the repo exists yet. Reviewers click those links.
Push it, or remove the URLs.

## 6. The source-code upload AMO requires

**This is the section the sibling extension never needed, and the most likely rejection here.**

`tools/build.mjs` calls `esbuild.build({ bundle: true })` and compiles TypeScript to JavaScript.
That hits two items on AMO's own list — "tools that combine multiple files into a single file, such
as webpack" and "any other tool that takes code or files, applies processing, and generates code or
file(s) to include in the extension". **Answer Yes to the source-code question and upload an
archive.** "Not minified" buys nothing; minification is only the first bullet.

The two ways to get this wrong:

- **Answer Yes and upload nothing** — `SourceForm.clean_source()` raises "You have not uploaded a
  source file" and the step will not advance. Annoying, not fatal.
- **Answer No while shipping a bundle** — the version uploads clean, the reviewer opens a bundled
  `background.js`, and it is rejected as unreviewable. The version number is spent either way.

Chrome asks for nothing: its rule is "must not obfuscate code or conceal functionality", and
minification is explicitly allowed, so an unminified esbuild bundle is fine there.

**What goes in.** The tree minus `node_modules/`, `dist/`, `web-ext-artifacts/` and `.git/` — i.e.
`src/`, `tools/`, `tests/`, `icons/`, `manifest.src.json`, `package.json`, `package-lock.json`,
`tsconfig.json`, `vitest.config.ts`, `LICENSE` and the `.md` docs. `dist/` must **not** be in it:
AMO's rule is "source files cannot be transpiled, concatenated, minified, or otherwise
machine-generated", and shipping the build output as "source" is the exact thing that forbids.
`node_modules/` goes too — reviewers run `npm ci`, and the cap is 200MB.

**Making the archive.** Everything excluded is already gitignored, so `git archive` from the release
tag produces exactly the right contents and cannot accidentally include `dist/`. `.gitattributes`
adds `store-submissions export-ignore` and `.claude export-ignore`, so the dashboard notes and this
procedure stay in the repo but out of the reviewer's archive. `.claude/skills/` is tracked
deliberately — the release procedure has to survive a fresh clone. From the release tag:

```sh
git archive --format=zip -o ../wheres-the-download-1.0.0-source.zip v1.0.0
```

Only `.zip`, `.tar.gz`, `.tgz` and `.tar.bz2` are accepted (`VALID_SOURCE_EXTENSIONS` in
addons-server); anything else fails with "Invalid or broken archive". Matching source must be
attached to **every** version.

**What the README must say.** AMO wants step-by-step build instructions, a build script that runs
all the steps, OS and environment requirements, and the required versions and install instructions
for anything used in the build — in a README in the archive, or in the reviewer notes. Keep it in
`README.md` under "Build from source", so it is committed, tagged, and useful to more than
reviewers. It must say:

- **Node 24.18.1 / npm 11.16.0, built on Windows 11.** That differs from the reviewers' default box
  — Ubuntu 24.04.4 LTS Desktop, ARM64, 10GB RAM / 6 vCPU, Node 24.14.0 and npm 11.9.0, 35GB free —
  and Mozilla explicitly requires you to say so in the README when it does.
- **The build is platform-independent and their default box works unchanged.** Verified, not
  assumed: `package-lock.json` already carries all 26 `@esbuild/*` platform packages including
  `@esbuild/linux-arm64`, so `npm ci` on their ARM64 machine resolves the right binary. Do
  **not** tell them to pass `--ignore-scripts` — esbuild's install script is what selects that
  binary.
- **The commands, in order:** `npm ci`, then `npm run build`, which writes `dist/firefox/` —
  byte-for-byte the contents of the uploaded ZIP. Optionally `npm test` (531 Vitest tests) and
  `npm run typecheck`.
- **`npm ci`, and the same first command everywhere.** `package-lock.json` is committed, so `npm ci`
  is the reproducible one and `npm install` is not. `README.md`, the instructions inside the source
  archive and the reviewer notes must all name it identically: AMO's checklist has the reviewer work
  through the stated steps, so two of our own files disagreeing about how the build starts is a
  question raised against a submission that is already answering for a build tool.
- **The one trap: there is no `manifest.json` in the repo.** The checked-in file is
  `manifest.src.json`, and `tools/build.mjs` generates `dist/{firefox,chrome}/manifest.json` from
  it. A reviewer greps for `manifest.json`, finds nothing, and asks. One line prevents that.

esbuild is MIT-licensed and runs locally, which satisfies Mozilla's "build tools must be open
source" and "cannot be web-based". The build target is already a `dist/` subfolder, as Workshop asks.

## 7. Screenshots

**The extension has none yet.** Chrome will reject the listing without them.

- **Chrome — mandatory.** "If your product has a blank description field or is missing an icon or
  screenshots, it will be rejected." Store icon 128×128 PNG (artwork 96×96 with 16px transparent
  padding, working on light and dark) — `npm run icons` emits it as `docs/store-icon-128.png`. The
  manifest's `icons/icon-128.png` is full-bleed and is the wrong file for the listing tile; that is
  why there are two. At least 1 and up to 5 screenshots at 1280×800 or 640×400,
  square corners, full bleed, no padding — 1280×800 preferred. Small promo tile 440×280 PNG or JPEG,
  **required**, avoid text, must survive being halved on a light grey background. Marquee tile
  1400×560 is explicitly optional. The YouTube video is contradicted between Google's own pages
  (one lists it among assets you "must provide", another says only icon, promo tile and screenshot
  are mandatory) — leave it empty and see whether Submit blocks. Do not shoot a video on the
  strength of one sentence.
- **AMO — optional.** Nothing in the submission flow requires a preview. Recommended 1280×800 or any
  1.6:1 ratio, caption cap 280 each. Listing icon 32×32 and 64×64 PNG/JPEG; keep an SVG source.

Two shots carry the whole pitch: the injected panel on a real release page with the recommended
asset called out, and the honest "no ready-to-run build here" state — the second is worth more than
three more of the happy path, because it is the claim the summary makes. Shoot at 1280×800 and the
same files serve both stores. The store icon is the only asset here a command produces; the
screenshots and the promo tile are captured by hand, and there are still none.

## 8. After the merge

In this order:

1. **Push `main`.** Both listings give the GitHub `PRIVACY.md` URL as the privacy policy, so an
   unpushed policy contradicts the justification under review. Open it logged out and check it
   renders (§5).
2. **Tag and publish a GitHub release**, notes taken from the changelog so the two cannot drift:

   ```sh
   awk '/^## 1\.0\.0/{f=1;next} /^## /{f=0} f' CHANGELOG.md > /tmp/notes.md
   gh release create v1.0.0 --target "$(git rev-parse main)" --title "1.0.0" --notes-file /tmp/notes.md
   ```

   `--target` needs a full SHA or a branch name; a short SHA is rejected as an invalid
   `target_commitish`. No binaries attached: the Firefox ZIP is unsigned, so release Firefox will
   not install it permanently and attaching it invites "your download is broken".
3. **Empty `web-ext-artifacts/`, then `npm run package`**, and upload both ZIPs. web-ext writes a
   per-version filename and never deletes the old ones, so every past build stays in that directory
   until it is cleared and a stale ZIP is one mis-click away. Cleared first, what is in there is the
   version being uploaded. web-ext names both from the manifest name, so they differ only in the
   last word — check which one you are uploading.
4. **`git archive` the source ZIP from the tag** (§6) and upload it with the AMO version.
5. A version number is spent the moment it is uploaded, rejected or not. Keep Chrome and AMO on the
   same one, from the same `npm run package` run.

## 9. A build for your own Firefox while AMO review is pending

A listed version under review cannot be installed; `xpinstall.signatures.required` is ignored in
release and beta Firefox, so the only way to run it in everyday Firefox is a signed unlisted build.

Bump `manifest.src.json` **alone** to a fourth component (`1.0.0.1`), `npm run build`, then:

```sh
./node_modules/.bin/web-ext build --source-dir dist/firefox --overwrite-dest --filename "{name}-{version}-firefox.zip"
```

Restore the manifest and rebuild straight away — that bump must never be committed. Firefox only: a
matching Chrome ZIP sitting beside the real one is how the wrong version number gets spent.

Upload on AMO as **"On your own"**, not "On this site", and install the signed `.xpi` from
`about:addons`. The version has to be above whatever is already in the listed queue, and it will
sort above the listed build once that is approved, so it needs removing by hand then.

Unverified: whether the source-code step (§6) also appears for an unlisted upload. If it does, the
same `git archive` from the tag serves — but the fourth-component build is not at a tag, so archive
the tagged 1.0.0 tree and say so in the notes.
