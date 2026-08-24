/**
 * What an asset *is*: hard-excluded roles (checksums, sources, symbols...),
 * penalized roles (sdk, debug...), and the package kind with its format weight.
 */

import type { OperatingSystem, PackageKind } from './asset-types';
import {
  CHECKSUM_TOKEN_PATTERN,
  DEVELOPER_PACKAGE_EXTENSIONS,
  FORMAT_WEIGHT,
  HARD_ROLE_EXTENSIONS,
  HARD_ROLE_TOKEN_ALIASES,
  INSTALLER_WORDS,
  METADATA_EXTENSIONS,
  PENALIZED_ROLE_ALIASES,
  PORTABLE_WORD_ALIASES,
  SCRIPT_EXTENSIONS,
  UPDATER_MANIFEST_NAMES,
  type HardRole,
  type PenalizedRole,
} from './rules';
import { hasSequence, type TokenizedName } from './tokenizer';

export interface RoleDetection {
  /** Every detected role string, hard role (if any) first. */
  roles: string[];
  hardRole: HardRole | null;
  penalized: PenalizedRole[];
  cli: boolean;
  portable: boolean;
}

export function detectRoles(t: TokenizedName, size: number): RoleDetection {
  let hardRole: HardRole | null = size === 0 ? 'empty' : null;
  if (hardRole === null) hardRole = HARD_ROLE_EXTENSIONS[t.extension] ?? null;
  if (hardRole === null) {
    for (const [role, alias] of HARD_ROLE_TOKEN_ALIASES) {
      if (hasSequence(t.tokens, alias)) {
        hardRole = role;
        break;
      }
    }
  }
  if (hardRole === null && t.tokens.some((token) => CHECKSUM_TOKEN_PATTERN.test(token))) {
    hardRole = 'checksum';
  }
  // electron-updater / squirrel manifests: latest.yml, app-update.yaml, RELEASES
  if (
    hardRole === null &&
    (t.extension === '.yml' || t.extension === '.yaml') &&
    (t.tokens.includes('latest') || t.tokens.includes('update'))
  ) {
    hardRole = 'updater-metadata';
  }
  if (
    hardRole === null &&
    t.extension === '' &&
    t.tokens.length === 1 &&
    UPDATER_MANIFEST_NAMES.includes(t.tokens[0] ?? '')
  ) {
    hardRole = 'updater-metadata';
  }
  if (hardRole === null && METADATA_EXTENSIONS.includes(t.extension)) hardRole = 'metadata';

  const penalized: PenalizedRole[] = [];
  for (const [role, alias] of PENALIZED_ROLE_ALIASES) {
    if (!penalized.includes(role) && hasSequence(t.tokens, alias)) penalized.push(role);
  }
  if (DEVELOPER_PACKAGE_EXTENSIONS.includes(t.extension) && !penalized.includes('sdk')) {
    penalized.push('sdk');
  }
  if (t.extension in SCRIPT_EXTENSIONS) penalized.push('script');
  const cli = t.tokens.includes('cli');
  const portable = PORTABLE_WORD_ALIASES.some((alias) => hasSequence(t.tokens, alias));

  const roles: string[] = [];
  if (hardRole !== null) roles.push(hardRole);
  roles.push(...penalized);
  if (cli) roles.push('cli');
  if (portable) roles.push('portable');
  return { roles, hardRole, penalized, cli, portable };
}

const HARD_ROLE_KIND: Readonly<Record<HardRole, PackageKind>> = {
  source: 'source',
  checksum: 'checksum',
  signature: 'signature',
  sbom: 'unknown',
  symbols: 'symbols',
  'updater-metadata': 'updater-metadata',
  metadata: 'unknown',
  empty: 'unknown',
};

export function kindForHardRole(role: HardRole): PackageKind {
  return HARD_ROLE_KIND[role];
}

export interface PackageDetection {
  kind: PackageKind;
  formatWeight: number;
}

const TARBALLS: readonly string[] = ['.tar.gz', '.tar.xz', '.tar.bz2', '.tgz', '.txz'];
const LOOSE_COMPRESSED: readonly string[] = ['.gz', '.xz', '.bz2', '.zst'];

const isInstallerWord = (token: string): boolean =>
  INSTALLER_WORDS.some((w) => token === w || token.startsWith(w) || token.endsWith(w));

export function detectPackageKind(
  t: TokenizedName,
  systems: readonly OperatingSystem[],
): PackageDetection {
  const windows = systems.includes('windows');
  const ext = t.extension;
  const archive = (windowsWeight: number): PackageDetection =>
    windows
      ? { kind: 'portable-archive', formatWeight: windowsWeight }
      : { kind: 'generic-archive', formatWeight: FORMAT_WEIGHT.genericArchive };

  if (ext === '.msi') return { kind: 'windows-installer', formatWeight: FORMAT_WEIGHT.msi };
  if (ext === '.msix' || ext === '.msixbundle' || ext === '.appx' || ext === '.appxbundle') {
    return { kind: 'windows-installer', formatWeight: FORMAT_WEIGHT.storeApp };
  }
  if (ext === '.exe') {
    return t.tokens.some(isInstallerWord)
      ? { kind: 'windows-installer', formatWeight: FORMAT_WEIGHT.installerExe }
      : { kind: 'windows-executable', formatWeight: FORMAT_WEIGHT.bareExe };
  }
  if (ext === '.dmg' || ext === '.pkg') {
    return { kind: 'macos-installer', formatWeight: FORMAT_WEIGHT.dmgOrPkg };
  }
  if (ext === '.app.zip') return { kind: 'macos-application', formatWeight: FORMAT_WEIGHT.appZip };
  if (ext === '.appimage') return { kind: 'linux-appimage', formatWeight: FORMAT_WEIGHT.appimage };
  if (ext === '.deb') return { kind: 'linux-deb', formatWeight: FORMAT_WEIGHT.deb };
  if (ext === '.rpm') return { kind: 'linux-rpm', formatWeight: FORMAT_WEIGHT.rpm };
  if (ext === '.jar') return { kind: 'java-archive', formatWeight: FORMAT_WEIGHT.javaArchive };
  if (ext === '.zip') return archive(FORMAT_WEIGHT.windowsZip);
  if (ext === '.7z') return archive(FORMAT_WEIGHT.windowsSevenZip);
  if (TARBALLS.includes(ext)) return archive(FORMAT_WEIGHT.windowsTar);
  if (LOOSE_COMPRESSED.includes(ext)) {
    return { kind: 'generic-archive', formatWeight: FORMAT_WEIGHT.genericArchive };
  }
  return { kind: 'unknown', formatWeight: 0 };
}

/** Beginner-facing label for a package kind, for UI badges. */
export function describePackage(kind: PackageKind): string {
  switch (kind) {
    case 'windows-installer':
      return 'Windows installer';
    case 'windows-executable':
      return 'Windows program';
    case 'portable-archive':
      return 'Portable app (archive)';
    case 'macos-installer':
      return 'Mac installer';
    case 'macos-application':
      return 'Mac app';
    case 'linux-appimage':
      return 'Linux app (AppImage)';
    case 'linux-deb':
      return 'Linux package (Debian/Ubuntu)';
    case 'linux-rpm':
      return 'Linux package (Fedora/openSUSE)';
    case 'generic-archive':
      return 'Compressed archive';
    case 'java-archive':
      return 'Java program (needs Java)';
    case 'source':
      return 'Source code';
    case 'checksum':
      return 'Checksum file';
    case 'signature':
      return 'Signature file';
    case 'symbols':
      return 'Debug symbols';
    case 'sdk':
      return 'Developer kit';
    case 'updater-metadata':
      return 'Auto-updater file';
    case 'unknown':
      return 'File';
  }
}
