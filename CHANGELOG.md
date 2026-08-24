# Changelog

## 1.0.0

First public release.

- On a repository's home page, its releases list and any single release page, a
  panel names the file to download for the computer you are on, with its size
  and a one-line reason. **Other downloads** lists the rest of the release, each
  with its own reason; **Advanced details** shows the evidence behind the choice.
- It says how sure it is. Where two files are equally plausible it says so
  instead of picking one with false confidence, and where nothing in the release
  will run on your computer it says that too, with plain-language hints on where
  the download usually lives instead — the project's README, a package manager
  such as pip or npm, or the project's own website.
- Tuned against real releases. Builds of the same program that differ only in
  packaging are separated by how often each has been downloaded; checksums,
  signatures, debug symbols, updater metadata and source archives are never
  offered as the program; a build for a different processor is labelled rather
  than recommended.
- A file that looks like a command-line tool or a shell script is marked as one,
  so a terminal window instead of a program window is not a surprise.
- Overrides for operating system, processor, installer-versus-portable
  preference and whether prereleases count, in the panel and on the options page.
- Release information comes from GitHub's public API and is cached, so ordinary
  browsing stays inside the unauthenticated request allowance. Nothing is
  downloaded or run for you: the panel shows an ordinary link and you click it.
  The recommendation is about compatibility, not a security review.
- Chrome 121+ and Firefox 140+ (Firefox for Android 142+).
