# Changelog

## 0.1.0

First release.

- Panel on repository home and release pages recommending the ready-to-run
  download for the visitor's operating system and architecture.
- Deterministic filename classifier: OS, architecture, package kind, roles,
  hard exclusions for source/checksum/signature/symbol/updater files.
- Confidence levels with plain-language explanations; honest empty states for
  repositories without releases or without a compatible build.
- Simple and advanced modes; in-panel overrides for OS, architecture, package
  preference and release channel; options page.
- Source-archive note beside GitHub-generated "Source code" links on release
  pages.
- GitHub REST API access from the background only, with a one-hour cache,
  conditional requests, stale fallback and negative caching.
- Chrome and Firefox Manifest V3 builds from one source tree.
