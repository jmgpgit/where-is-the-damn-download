/**
 * The rulebook: alias tables and weights in one place, so tuning never means
 * hunting through the classifier.
 *
 * Aliases are consecutive-token sequences; a one-element alias must match a
 * whole token. Weights are relative nudges, not probabilities.
 */

import type { Architecture, OperatingSystem } from './asset-types';

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
  ['linux', ['appimage']],
];

/** Extensions that on their own pin the OS. */
export const OS_EXTENSIONS: Readonly<Record<string, OperatingSystem>> = {
  '.exe': 'windows',
  '.msi': 'windows',
  '.msix': 'windows',
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
  ['arm64', ['arm64']],
  ['arm64', ['aarch64']],
  ['arm64', ['arm', '64']],
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
  ['riscv64', ['riscv64']],
  ['universal', ['universal']],
  ['universal', ['universal2']],
  ['universal', ['noarch']],
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
  | 'empty';

export const HARD_ROLE_TOKEN_ALIASES: ReadonlyArray<readonly [HardRole, AliasSequence]> = [
  ['source', ['source']],
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
  ['sbom', ['spdx']],
  ['sbom', ['cyclonedx']],
  ['sbom', ['sbom']],
  ['sbom', ['provenance']],
  ['sbom', ['attestation']],
  ['sbom', ['intoto']],
  ['symbols', ['symbols']],
  ['symbols', ['pdb']],
  ['symbols', ['dsym']],
  ['updater-metadata', ['appcast']],
];

export const HARD_ROLE_EXTENSIONS: Readonly<Record<string, HardRole>> = {
  '.sha256': 'checksum',
  '.sha512': 'checksum',
  '.md5': 'checksum',
  '.sig': 'signature',
  '.asc': 'signature',
  '.minisig': 'signature',
  '.spdx.json': 'sbom',
  '.cdx.json': 'sbom',
  '.dsym.zip': 'symbols',
  '.blockmap': 'updater-metadata',
};

/** Still eligible, but pushed down. `nightly` only bites on the stable channel. */
export const ROLE_PENALTIES = {
  sdk: -70,
  debug: -50,
  nightly: -45,
  server: -20,
  plugin: -20,
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

export const INSTALLER_WORDS: readonly string[] = [
  'setup',
  'installer',
  'install',
  'nsis',
  'inno',
  'squirrel',
  'websetup',
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
/** Applied by recommend() only when a real installer competes in the release. */
export const PORTABLE_WHEN_INSTALLER_PREFERRED = -6;
