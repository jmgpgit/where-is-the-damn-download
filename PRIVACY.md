# Privacy

Where's the Damn Download? runs on github.com pages and helps you pick a
release download. This is everything it does with data. Each claim names the
file that implements it, so it can be checked against the source.

## What it sends

- Requests to GitHub's own public REST API (`https://api.github.com`) for the
  releases of the repository you are looking at: `/releases/latest`,
  `/releases/tags/<tag>` when you are on a single release's page, or
  `/releases?per_page=15` when prereleases are included, or when
  `/releases/latest` finds nothing and "no stable release" has to be told apart
  from "no releases at all". The request carries the repository owner and name, the
  tag where one applies, and an `ETag` from a previous answer so GitHub can say
  "unchanged". It is unauthenticated: no token, no sign-in, no cookies of
  yours. (`src/github/api-client.ts`; requests are made only from the
  background, `src/background/release-service.ts`.)
- A request happens because you opened a repository page, and only when the
  panel is switched on for that page. Answers are cached, so ordinary browsing
  does not ask GitHub the same thing twice.
- Nothing to anyone else. `api.github.com` is the only host contacted. There is
  no server of ours, no analytics, no telemetry, no crash reporting, no
  third-party script, no font or stylesheet fetched from anywhere.

## What it stores, on your device only

- Your preferences — whether the panel is on, and on which pages, operating
  system and architecture overrides, installer-versus-portable preference,
  release channel, simple or advanced display, and whether source-code archives
  are marked on release pages — under a single key in the
  browser's extension settings storage (`storage.sync`,
  `src/storage/settings.ts`). If your browser syncs extension settings between
  your devices, these travel with it; that is the browser's feature, not ours.
- A cache of release metadata in local extension storage (`storage.local`,
  `src/storage/cache.ts`) for repositories you visited: the release's tag, name,
  page URL, publication date, prerelease flag and GitHub's numeric id for it,
  and for each attached file its name, label, content type, size, download
  count, checksum digest where GitHub publishes one, GitHub's numeric id for it,
  and the github.com link to the file itself (`src/shared/messages.ts` has the
  exact shape). Stored alongside the entry is the `ETag` from GitHub's response,
  which is what the next request sends back to ask "unchanged?".

  The limits, in the same file: an entry is reused without asking GitHub again
  for one hour, revalidated after that, and discarded once it is seven days old;
  an answer of "no releases", "repository not found" or "no stable release" is
  remembered for twenty minutes (`src/background/release-service.ts` decides
  which); and the cache holds at most 64 entries, the oldest dropped first.

It stores no browsing history, no personal information, and no release notes.

## What it adds to the page

The panel lives in its own shadow root, so its markup and styles do not mix
with GitHub's. One thing does go into GitHub's own page: on a release page,
when "Mark source-code archives on release pages" is on, it puts one line of
its own text beside each source-archive link GitHub generated
(`src/content/source-archive-annotation.ts`) — the line that says a source
archive is usually not the installable application. That is an added element
of ours and nothing else: it never alters, moves, hides, restyles or rewrites
anything GitHub rendered, and a link it cannot identify with certainty is left
alone. Turning the setting off stops it.

## What it never does

- It never downloads or runs anything. It shows a normal link; you click it.
- It never inspects, uploads, or scans downloaded files.
- It never signs in to GitHub or handles tokens.
- It never loads code from anywhere. Everything it runs ships inside the
  package; nothing is fetched or evaluated at runtime.
- It never sells, shares, or transmits personal data.

## What the recommendation means

The recommendation is about file compatibility with your computer — whether a
file is built for your operating system and processor. It is not a security
review. The extension does not know whether a project or its maintainers are
trustworthy, whether a file is signed, or whether it is free of malware.

## Permissions

- `storage` — preferences and the cache above.
- Host access to `https://api.github.com/*` — the release lookups.
- Content script on `https://github.com/*` — the panel on repository pages.

Those are all of them. There is no `downloads`, `tabs`, `webRequest` or
`<all_urls>` permission (`manifest.src.json`).

## Affiliation

Not affiliated with or endorsed by GitHub.
