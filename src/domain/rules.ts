/**
 * The rulebook: alias tables and weights in one place, so tuning never means
 * hunting through the classifier.
 *
 * Aliases are consecutive-token sequences; a one-element alias must match a
 * whole token. Weights are relative nudges, not probabilities.
 */

import type { Architecture, OperatingSystem, PackageKind } from './asset-types';

export type AliasSequence = readonly string[];

// --- operating systems -------------------------------------------------------

export const OS_TOKEN_ALIASES: ReadonlyArray<readonly [OperatingSystem, AliasSequence]> = [
  ['windows', ['windows']],
  ['windows', ['win']],
  ['windows', ['win32']],
  ['windows', ['win64']],
  ['windows', ['msvc']],
  ['windows', ['mingw']],
  ['windows', ['pc', 'windows']],
  ['windows', ['win', 'x64']],
  ['windows', ['win', 'arm64']],
  ['windows', ['win', 'x86']],
  ['macos', ['mac']],
  ['macos', ['macos']],
  ['macos', ['osx']],
  ['macos', ['darwin']],
  ['macos', ['apple', 'darwin']],
  ['macos', ['apple', 'silicon']],
  ['macos', ['universal2']],
  ['linux', ['linux']],
  ['linux', ['ubuntu']],
  ['linux', ['debian']],
  ['linux', ['fedora']],
  ['linux', ['glibc']],
  ['linux', ['musl']],
  ['linux', ['musllinux']],
  ['linux', ['manylinux']],
  ['linux', ['appimage']],
  ['android', ['android']],
  ['openbsd', ['freebsd']],
  ['openbsd', ['netbsd']],
  ['openbsd', ['openbsd']],
  ['openbsd', ['dragonfly']],
  ['openbsd', ['bsd']],
];

/** Tokens naming a system no desktop user can run: token → display name. */
export const NON_DESKTOP_OS_TOKENS: Readonly<Record<string, string>> = { ios: 'iOS' };

/** Extensions that on their own pin the OS. */
export const OS_EXTENSIONS: Readonly<Record<string, OperatingSystem>> = {
  '.exe': 'windows',
  '.msi': 'windows',
  '.msix': 'windows',
  '.msixbundle': 'windows',
  '.appx': 'windows',
  '.appxbundle': 'windows',
  '.dmg': 'macos',
  '.pkg': 'macos',
  '.app.zip': 'macos',
  '.appimage': 'linux',
  '.deb': 'linux',
  '.rpm': 'linux',
  '.flatpakref': 'linux',
  '.snap': 'linux',
};

/** Terminal scripts: penalized role, and the extension implies the OS family. */
export const SCRIPT_EXTENSIONS: Readonly<Record<string, readonly OperatingSystem[]>> = {
  '.sh': ['macos', 'linux'],
  '.command': ['macos', 'linux'],
  '.ps1': ['windows'],
  '.bat': ['windows'],
  '.cmd': ['windows'],
};

// --- architectures -----------------------------------------------------------

// Bare `x86` (only when not followed by `64`) and bare `win32` (weak x86, only
// without any other arch token) need lookahead; platform-detection handles them.
export const ARCH_TOKEN_ALIASES: ReadonlyArray<readonly [Architecture, AliasSequence]> = [
  ['x64', ['x64']],
  ['x64', ['x86', '64']],
  ['x64', ['amd64']],
  ['x64', ['win64']],
  ['x64', ['64', 'bit']],
  ['x64', ['64bit']],
  ['x64', ['intel']],
  ['arm64', ['arm64']],
  ['arm64', ['aarch64']],
  ['arm64', ['arm', '64']],
  ['arm64', ['m1']],
  ['arm64', ['m2']],
  ['arm64', ['m3']],
  ['arm64', ['m4']],
  ['x86', ['ia32']],
  ['x86', ['i386']],
  ['x86', ['i486']],
  ['x86', ['i586']],
  ['x86', ['i686']],
  ['x86', ['32', 'bit']],
  ['x86', ['32bit']],
  ['x86', ['x86', '32']],
  ['arm', ['armv7']],
  ['arm', ['armhf']],
  ['arm', ['armv5']],
  ['arm', ['armv6']],
  ['arm', ['armv6l']],
  ['arm', ['armv7l']],
  ['arm', ['armv7hf']],
  ['arm', ['arm32']],
  ['arm', ['armel']],
  ['riscv64', ['riscv64']],
  ['riscv64', ['riscv64gc']],
  ['universal', ['universal']],
  ['universal', ['universal2']],
  ['universal', ['noarch']],
];

/** Processor families no supported desktop has; excluded for x64/arm64/x86/arm users. */
export const FOREIGN_ARCH_TOKENS: readonly string[] = [
  's390x', 'ppc64', 'ppc64le', 'powerpc', 'powerpc64le', 'loong64', 'loongarch64',
  'mips', 'mips64', 'mips64el', 'mipsel', 'sparc64', 'ia64',
];

// --- roles -------------------------------------------------------------------

/** Never primary, never alternative. */
export type HardRole =
  | 'source'
  | 'checksum'
  | 'signature'
  | 'sbom'
  | 'symbols'
  | 'updater-metadata'
  | 'metadata'
  | 'empty';

export const HARD_ROLE_TOKEN_ALIASES: ReadonlyArray<readonly [HardRole, AliasSequence]> = [
  ['source', ['source']],
  ['source', ['sources']],
  ['source', ['src']],
  ['source', ['source', 'code']],
  ['checksum', ['checksum']],
  ['checksum', ['checksums']],
  ['checksum', ['sha256']],
  ['checksum', ['sha512']],
  ['checksum', ['md5']],
  ['checksum', ['sums']],
  ['signature', ['sig']],
  ['signature', ['asc']],
  ['signature', ['gpg']],
  ['signature', ['cosign']],
  ['signature', ['minisig']],
  ['signature', ['sigstore']],
  ['sbom', ['spdx']],
  ['sbom', ['cyclonedx']],
  ['sbom', ['sbom']],
  ['sbom', ['provenance']],
  ['sbom', ['attestation']],
  ['sbom', ['intoto']],
  ['symbols', ['symbols']],
  ['symbols', ['pdb']],
  ['symbols', ['pdbs']],
  ['symbols', ['dsym']],
  ['symbols', ['dsyms']],
  ['symbols', ['dbgsym']],
  ['symbols', ['dbsym']],
  ['symbols', ['debugsymbols']],
  ['updater-metadata', ['appcast']],
  ['updater-metadata', ['dist', 'manifest']],
];

export const HARD_ROLE_EXTENSIONS: Readonly<Record<string, HardRole>> = {
  '.sha1': 'checksum',
  '.sha256': 'checksum',
  '.sha512': 'checksum',
  '.md5': 'checksum',
  '.sha1sum': 'checksum',
  '.sha256sum': 'checksum',
  '.sha512sum': 'checksum',
  '.md5sum': 'checksum',
  '.sig': 'signature',
  '.asc': 'signature',
  '.minisig': 'signature',
  '.pem': 'signature',
  '.sigstore.json': 'signature',
  '.spdx.json': 'sbom',
  '.cdx.json': 'sbom',
  '.pdb': 'symbols',
  '.dsym.zip': 'symbols',
  '.ddeb': 'symbols',
  '.blockmap': 'updater-metadata',
  '.zsync': 'updater-metadata',
};

/** Text/metadata files; checked last so SHA256SUMS.txt stays a checksum and latest.yml an updater file. */
export const METADATA_EXTENSIONS: readonly string[] = [
  '.json', '.txt', '.md', '.xml', '.html', '.pdf', '.csv', '.log', '.yml', '.yaml',
];

/** Whole stem tokens that name a checksum list: SHA256SUMS, SHASUMS256, SHA2-256SUMS, md5sums… */
export const CHECKSUM_TOKEN_PATTERN = /^(?:sha\d*sums?|shasums?\d*|\d+sums?|md5sums?|checksums?|b2sums?)$/;

/** Squirrel's bare `RELEASES` manifest: no extension, exactly this name. */
export const UPDATER_MANIFEST_NAMES: readonly string[] = ['releases'];

/**
 * Packaging conventions that belong to command-line tools, not desktop apps.
 *
 * A Rust target triple (`x86_64-pc-windows-msvc`, `aarch64-apple-darwin`) comes
 * from cargo/cargo-dist, and a GUI application published that way is vanishingly
 * rare. So is an extension-less binary named after its OS (`yt-dlp_linux`).
 * Neither proves anything about the binary, hence the hedged wording: this only
 * ever adds a note, never a penalty.
 */
export const TRIPLE_VENDOR_TOKENS: readonly string[] = ['pc', 'apple', 'unknown'];
export const TRIPLE_SYSTEM_TOKENS: readonly string[] = [
  'msvc',
  'gnu',
  'musl',
  'gnueabihf',
  'musleabihf',
  'darwin',
];

/** An extension-less file ending in one of these is a raw binary: `yt-dlp_linux`. */
export const BARE_BINARY_OS_TOKENS: readonly string[] = [
  'linux',
  'macos',
  'darwin',
  'osx',
  'windows',
  'win',
];

/** Package-manager payloads (NuGet, wheel, crate): developer material, not a beginner download. */
export const DEVELOPER_PACKAGE_EXTENSIONS: readonly string[] = ['.nupkg', '.whl', '.crate'];

/** Still eligible, but pushed down. `nightly` only bites on the stable channel. */
export const ROLE_PENALTIES = {
  sdk: -70,
  debug: -50,
  nightly: -45,
  server: -20,
  plugin: -20,
  script: -40,
} as const;

export type PenalizedRole = keyof typeof ROLE_PENALTIES;

export const PENALIZED_ROLE_ALIASES: ReadonlyArray<readonly [PenalizedRole, AliasSequence]> = [
  ['sdk', ['sdk']],
  ['debug', ['debug']],
  ['nightly', ['nightly']],
  ['nightly', ['canary']],
  ['nightly', ['experimental']],
  ['server', ['server']],
  ['server', ['headless']],
  ['plugin', ['plugin']],
  ['plugin', ['extension']],
];

/** Matched as whole token or as prefix/suffix: `powertoysusersetup`, `websetup`, `installer64`. */
export const INSTALLER_WORDS: readonly string[] = [
  'setup',
  'installer',
  'install',
  'nsis',
  'inno',
  'squirrel',
];

export const PORTABLE_WORD_ALIASES: readonly AliasSequence[] = [
  ['portable'],
  ['standalone'],
  ['noinstall'],
  ['self', 'contained'],
];

// --- weights -----------------------------------------------------------------

export const OS_WEIGHT = {
  explicitToken: 50,
  impliedByExtension: 40,
  neutral: 15,
  unspecified: 5,
} as const;

export const ARCH_WEIGHT = {
  exact: 30,
  universal: 22,
  unspecified: 8,
  /** 32-bit build offered to a 64-bit Windows user: runs, but warn. */
  thirtyTwoOnSixtyFour: 3,
} as const;

// An .exe with any installer word lands at 34 total; words never stack.
export const FORMAT_WEIGHT = {
  msi: 35,
  storeApp: 32,
  installerExe: 34,
  bareExe: 28,
  windowsZip: 16,
  windowsSevenZip: 12,
  windowsTar: 2,
  dmgOrPkg: 35,
  appZip: 32,
  appimage: 34,
  deb: 30,
  rpm: 30,
  genericArchive: 8,
  /** Below every archive so a .jar never outranks a native package. */
  javaArchive: 4,
} as const;

export const PORTABLE_PREFERRED_BONUS = 20;
/** Lets an arch-less Setup.exe (82) beat an arch-tagged portable zip (96). */
export const PREFERRED_INSTALLER_BONUS = 18;
/** Applied by recommend() only when a real installer competes in the release. */
export const PORTABLE_WHEN_INSTALLER_PREFERRED = -6;

/** Beginner-friendliness: installer > executable > AppImage/deb/rpm > portable > generic > Java. */
export const FORMAT_RANK: Readonly<Partial<Record<PackageKind, number>>> = {
  'windows-installer': 6,
  'macos-installer': 6,
  'windows-executable': 5,
  'macos-application': 5,
  'linux-appimage': 4,
  'linux-deb': 4,
  'linux-rpm': 4,
  'portable-archive': 3,
  'generic-archive': 2,
  'java-archive': 1,
};
