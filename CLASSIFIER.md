# Classifier

`src/domain` turns a release's asset list into a recommendation. It is
deterministic rules, not machine learning: same assets, platform and
preferences in, same answer out, regardless of input order.

## Pipeline

```text
tokenize → detect OS / architecture → detect package kind + roles
        → eligibility (hard exclusions) → score → rank (tie-break chain)
        → confidence → explanations
```

## Tokenization (`tokenizer.ts`)

- Lowercase for matching; original kept for display.
- Compound extensions are matched longest-first (`.tar.gz`, `.tar.xz`,
  `.tar.bz2`, `.app.zip`, `.dSYM.zip`, `.spdx.json`, `.cdx.json`) before
  single ones.
- The rest splits on spaces, hyphens, underscores, periods, parentheses and
  slashes into tokens.
- Aliases match **token sequences**, never substrings. `x86_64` and `x86-64`
  both become `[x86, 64]`; `pc-windows-msvc` becomes `[pc, windows, msvc]`.
  So `darwin` can never read as Windows and `resources` can never read as
  source.
- Purely numeric tokens are version noise. A bare `64` means nothing.

## Aliases (`rules.ts`)

| Signal   | Tokens / extensions                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Windows  | windows, win, win32, win64, msvc, mingw, pc-windows, win-x64/arm64/x86; `.exe .msi .msix .msixbundle .appx .appxbundle`; `.ps1 .bat .cmd` |
| macOS    | mac, macos, osx, darwin, apple-darwin, apple-silicon, universal2; `.dmg .pkg .app.zip`; `.sh .command` (with Linux)                       |
| Linux    | linux, ubuntu, debian, fedora, glibc, musl, musllinux, manylinux, appimage; `.AppImage .deb .rpm .flatpakref .snap`                       |
| Other OS | android; freebsd, netbsd, openbsd, dragonfly, bsd → "BSD"; ios → excluded for everyone                                                    |
| x64      | x64, x86_64, x86-64, amd64, win64, 64bit, 64-bit, intel                                                                                   |
| ARM64    | arm64, aarch64, arm-64, m1…m4                                                                                                             |
| x86      | x86 (not followed by 64), ia32, i386…i686, 32bit, 32-bit, x86_32; win32 weakly                                                            |
| ARM      | arm (not followed by 64), armv5/6/7, armv6l, armv7l, armv7hf, armhf, arm32, armel                                                         |
| Other    | riscv64, riscv64gc; universal, universal2, noarch → universal                                                                             |
| Foreign  | s390x, ppc64(le), powerpc, loong64, loongarch64, mips*, sparc64, ia64 → excluded for x64/arm64/x86/arm users                              |

`win32` names the platform first; it hints 32-bit only when no other
architecture token exists.

## Package kinds and roles (`role-detection.ts`)

Hard-excluded (never primary, never an alternative): source archives
(`source`, `src`, `source-code`), checksums (`sha256`, `sha512`, `md5`,
`checksums`, `sums`, list names like `SHA256SUMS`/`SHASUMS256.txt`, and
`.sha1`/`.sha256sum`-style extensions), signatures (`sig`, `asc`, `gpg`,
`cosign`, `minisig`, `.pem`, `.sigstore.json`), provenance/attestation/SBOM
(`spdx`, `cyclonedx`, `sbom`, `intoto`), symbols (`symbols`, `pdb(s)`,
`dsym(s)`, `dbgsym`, `dbsym`, `.ddeb`), updater metadata (`latest.yml`,
`update.yaml`, `.blockmap`, `.zsync`, `dist-manifest`, appcast, Squirrel's
bare `RELEASES`), plain metadata (`.json .txt .md .xml .html .pdf .csv .log
.yml .yaml` once the checks above have passed, so `SHA256SUMS.txt` stays a
checksum), and zero-byte assets. Package-manager payloads (`.nupkg`, `.whl`,
`.crate`) stay eligible but carry the `sdk` penalty.

Penalized but eligible: `sdk` −70, `debug` −50, `nightly`/`canary`/
`experimental` −45 on the stable channel, `script` (`.sh .command .ps1 .bat
.cmd`) −40 and never `high`, `server`/`headless` −20, `plugin`/`extension`
−20. `cli` is not penalized — it is labelled "Command-line application"
instead. `.jar` is a `java-archive`: eligible, labelled "requires Java",
weighted below native packages.

Installer words (`setup`, `install`, `installer`, `nsis`, `inno`, `squirrel`)
match a whole token or its prefix/suffix, so `PowerToysUserSetup` and
`websetup` are installers.

**Weak candidates** (`recommend.ts`): an eligible asset with no OS evidence at
all whose kind is `generic-archive` or `unknown` (`pandas-3.0.5.tar.gz`,
`GroupPolicyObjectFiles.zip`) is never primary. If the best candidate is weak
the answer is "no primary, confidence none"; weak assets stay listed as
alternatives.

## Score components (`scoring.ts`)

| Component                                         | Weight                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Explicit target OS token                          | +50                                                                                      |
| Extension strongly implying target OS             | +40                                                                                      |
| Platform-neutral asset                            | +15                                                                                      |
| OS unspecified                                    | +5                                                                                       |
| Explicit incompatible OS                          | exclude                                                                                  |
| Exact architecture                                | +30                                                                                      |
| Universal architecture                            | +22                                                                                      |
| Architecture unspecified                          | +8                                                                                       |
| x86 on x64 Windows                                | +3 and a warning                                                                         |
| Explicit incompatible architecture                | exclude                                                                                  |
| Foreign architecture (s390x, ppc64le…) / iOS      | exclude                                                                                  |
| `.msi` / `.msix` / installer `.exe` / bare `.exe` | +35 / +32 / +34 / +28                                                                    |
| Windows `.zip` / `.7z` / tar                      | +16 / +12 / +2                                                                           |
| Installer preferred and kind is an installer      | +18 (so an arch-less `Setup.exe` beats an arch-tagged portable zip)                      |
| Portable words                                    | + when portable preferred, ~0 otherwise, small − when installer preferred and one exists |

No emulation is assumed: ARM64 is never offered to x64 users or vice versa.

Download counts never enter the score. They are a late, bounded tie-breaker.

## Tie-breaking (`recommend.ts`)

Higher score → explicit OS over implied → explicit architecture over
unspecified → preferred package type → friendlier format (installer >
executable > AppImage/deb/rpm > portable archive > generic archive > Java) →
non-debug → more downloads → filename A–Z.

Two assets with the same kind, OS and architecture evidence are **variants**
of one thing (user vs machine setup, msvc vs gnu, lts, mono, Ubuntu 24.04 vs
26.04). Downloads decide, the primary gets the note "Chosen over … because
more people downloaded it", and confidence is not lowered for it.

## Confidence (`confidence.ts`)

- **high** — explicit OS evidence (token or OS-specific extension), no
  architecture contradiction, a beginner-usable kind, a clear margin (≥ 15)
  over the first non-variant runner-up, no suspicious role.
- **medium** — strong OS match but architecture unspecified, or a Windows
  archive rather than an installer, or a modest margin, or a variant tie.
- **low** — a rival within 8 points that is at least as beginner-friendly and
  not a 32-bit stand-in (a portable zip trailing an installer, or a 32-bit
  installer trailing a 64-bit one, never creates ambiguity), only generic
  evidence, or unknown architecture while several arch-tagged builds for this
  OS exist.
- **none** — nothing eligible, or only weak candidates.

## Explanations (`explanations.ts`)

Sentences are generated from `RuleEvidence`, not hand-written per case.
Every primary has at least one positive sentence; every excluded asset has an
exclusion sentence. The UI shows evidence with `effect` positive/informational
under "Why this file?", and exclusion evidence beside excluded files.

## Adding rules and fixtures

1. Add the filename to the asset table in the relevant `tests/*.test.ts`, or a
   whole release to `tests/fixtures/repository-cases/*.json`
   (`{name, platform, preferences, assets, expect}`), with the expected
   outcome. For a real release, `npm run probe -- owner/repo` prints what the
   classifier would pick for Windows x64, macOS ARM64 and Linux x64;
   `--save` snapshots it under `tests/fixtures/real-world/` — then add its
   expectations to `tests/real-world.test.ts`.
2. Watch it fail.
3. Adjust `rules.ts` (aliases, weights) before touching logic.
4. Run `npm test`; the invariant suite must stay green (exclusions never
   primary, popularity never overrides compatibility, determinism, every
   recommendation explained).

## Known ambiguous conventions

- `win32` is both "Windows" and, sometimes, "32-bit".
- `x86` alone: 32-bit; `x86_64`: 64-bit. Tokenization keeps them apart.
- `universal` on macOS means both architectures; elsewhere it usually means
  "no native code".
- A repository whose product is literally called "Source" or "Manifest" will
  be misread; classification looks at asset names, not repository names, to
  limit the damage.
- Portable `.zip` vs installer is a preference, not a correctness question;
  the default favours the installer.
