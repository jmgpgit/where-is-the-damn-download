# Privacy

Where's the Damn Download? runs on github.com pages and helps you pick a
release download. This is everything it does with data.

## What it sends

- Requests to GitHub's own public REST API (`https://api.github.com`) for the
  releases of the repository you are looking at. The request carries the
  repository owner and name, and an `ETag` from a previous answer so GitHub can
  say "unchanged". Nothing else.
- Nothing to anyone else. There is no server of ours, no analytics, no
  telemetry, no crash reporting, no third-party script.

## What it stores, on your device only

- Your preferences (operating system and architecture overrides, package
  preference, release channel, display options), in the browser's extension
  storage. If your browser syncs extension settings between your devices,
  these travel with it — that is the browser's feature, not ours.
- A small cache of release metadata (tag name, asset names, sizes, download
  counts, download links) for repositories you visited, so revisiting a page
  does not spend GitHub's unauthenticated request allowance. Entries expire
  within seven days and the cache is capped at 64 repositories.

It stores no browsing history, no personal information, and no release notes.

## What it never does

- It never downloads or runs anything. It shows a normal link; you click it.
- It never inspects, uploads, or scans downloaded files.
- It never signs in to GitHub or handles tokens.
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

## Affiliation

Not affiliated with or endorsed by GitHub.
