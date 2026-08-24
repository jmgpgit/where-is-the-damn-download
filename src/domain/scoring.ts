/**
 * Turns one raw asset into a ClassifiedAsset: detections, evidence trail,
 * eligibility, score. Popularity is deliberately absent; downloadCount only
 * breaks ties in recommend().
 *
 * Evidence explanations are beginner clauses ("is marked for Windows") that
 * explanations.ts stitches into sentences; exclusions are full sentences.
 */

import type {
  Architecture,
  AssetInput,
  ClassifiedAsset,
  OperatingSystem,
  PackageKind,
  RuleEvidence,
  UserPlatform,
  UserPreferences,
} from './asset-types';
import { detectArchitectures, detectOperatingSystems } from './platform-detection';
import { detectPackageKind, detectRoles, kindForHardRole } from './role-detection';
import {
  ARCH_WEIGHT,
  OS_WEIGHT,
  PORTABLE_PREFERRED_BONUS,
  ROLE_PENALTIES,
  type HardRole,
  type PenalizedRole,
} from './rules';
import { tokenize } from './tokenizer';

export const OS_NAMES: Readonly<Record<OperatingSystem, string>> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android',
  chromeos: 'ChromeOS',
  openbsd: 'OpenBSD',
  unknown: 'an unknown system',
};

export const ARCH_NAMES: Readonly<Record<Architecture, string>> = {
  x64: '64-bit',
  arm64: 'ARM 64-bit',
  x86: '32-bit',
  arm: 'ARM',
  riscv64: 'RISC-V',
  universal: 'any',
  unknown: 'unknown',
};

const HARD_ROLE_EXPLANATIONS: Readonly<Record<HardRole, string>> = {
  checksum: 'Not recommended: this is a checksum file used to verify another download.',
  signature: 'Not recommended: this is a digital signature used to verify another download.',
  source: 'Not recommended: this is the source code, not a ready-to-run program.',
  sbom: 'Not recommended: this file describes the software for auditors; it is not the program.',
  symbols: 'Not recommended: this contains debugging symbols for developers, not the program.',
  'updater-metadata': "Not recommended: this file is used by the app's automatic updater.",
  empty: 'Not recommended: this file is empty.',
};

const PENALTY_CLAUSES: Readonly<Record<PenalizedRole, string>> = {
  sdk: 'is a software development kit, not the app itself',
  debug: 'is a debug build meant for developers',
  nightly: 'is an unstable preview build',
  server: 'is a server edition, not the desktop app',
  plugin: 'is a plugin, not the main application',
};

function formatClause(kind: PackageKind): string {
  switch (kind) {
    case 'windows-installer':
      return 'is a standard installer';
    case 'windows-executable':
      return 'is a program you can run directly';
    case 'portable-archive':
      return 'is a portable app inside an archive';
    case 'macos-installer':
      return 'is a standard Mac installer';
    case 'macos-application':
      return 'is a Mac application';
    case 'linux-appimage':
      return 'is a portable Linux app (AppImage)';
    case 'linux-deb':
      return 'is a Debian/Ubuntu package';
    case 'linux-rpm':
      return 'is a Fedora/openSUSE package';
    case 'generic-archive':
      return 'is a compressed archive';
    case 'java-archive':
      return 'is a Java program';
    default:
      return 'is a downloadable file';
  }
}

const listNames = <T extends string>(values: readonly T[], names: Readonly<Record<T, string>>): string =>
  values.map((v) => names[v]).join(' or ');

export function classifyAsset(
  asset: AssetInput,
  platform: UserPlatform,
  prefs: UserPreferences,
): ClassifiedAsset {
  const t = tokenize(asset.name);
  const os = detectOperatingSystems(t);
  const arch = detectArchitectures(t);
  const roles = detectRoles(t, asset.size);
  const evidence: RuleEvidence[] = [];
  const add = (
    ruleId: string,
    category: RuleEvidence['category'],
    effect: RuleEvidence['effect'],
    weight: number,
    explanation: string,
  ): void => {
    evidence.push({ ruleId, category, effect, weight, explanation });
  };

  let eligible = true;
  let kind: PackageKind;

  if (roles.hardRole !== null) {
    kind = kindForHardRole(roles.hardRole);
    eligible = false;
    add(`role-${roles.hardRole}`, 'role', 'exclude', 0, HARD_ROLE_EXPLANATIONS[roles.hardRole]);
  } else {
    const pkg = detectPackageKind(t, os.systems);
    kind = pkg.kind;

    // --- operating system ---
    if (os.systems.length === 0) {
      const neutral = kind === 'java-archive' || arch.architectures.includes('universal');
      if (neutral) add('os-neutral', 'os', 'positive', OS_WEIGHT.neutral, 'works on any operating system');
      else add('os-unspecified', 'os', 'positive', OS_WEIGHT.unspecified, 'does not name an operating system');
    } else if (platform.os === 'unknown') {
      add('os-unspecified', 'os', 'positive', OS_WEIGHT.unspecified, `is marked for ${listNames(os.systems, OS_NAMES)}`);
    } else if (os.systems.includes(platform.os)) {
      if (os.tokenSystems.includes(platform.os)) {
        add('os-token', 'os', 'positive', OS_WEIGHT.explicitToken, `is marked for ${OS_NAMES[platform.os]}`);
      } else {
        add('os-extension', 'os', 'positive', OS_WEIGHT.impliedByExtension, `has a file type made for ${OS_NAMES[platform.os]}`);
      }
    } else {
      eligible = false;
      add('os-incompatible', 'os', 'exclude', 0, `Not for this computer: this build is for ${listNames(os.systems, OS_NAMES)} computers.`);
    }

    // --- architecture ---
    if (eligible) {
      const target = platform.arch;
      const found = arch.architectures;
      if (target === 'unknown' || target === 'universal' || found.length === 0) {
        add('arch-unspecified', 'architecture', 'positive', ARCH_WEIGHT.unspecified, 'does not name a processor type');
      } else if (found.includes(target)) {
        add('arch-exact', 'architecture', 'positive', ARCH_WEIGHT.exact, `matches your ${ARCH_NAMES[target]} computer`);
      } else if (found.includes('universal')) {
        add('arch-universal', 'architecture', 'positive', ARCH_WEIGHT.universal, 'runs on any processor');
      } else if (target === 'x64' && platform.os === 'windows' && found.includes('x86')) {
        add('arch-32-on-64', 'architecture', 'positive', ARCH_WEIGHT.thirtyTwoOnSixtyFour, 'is a 32-bit build on a 64-bit computer');
      } else {
        eligible = false;
        const osPart = os.systems.length > 0 ? `${listNames(os.systems, OS_NAMES)} on ` : '';
        add('arch-incompatible', 'architecture', 'exclude', 0, `Not for this computer: this build is for ${osPart}${listNames(found, ARCH_NAMES)} processors.`);
      }
    }

    // --- format, roles, preferences ---
    if (eligible) {
      add('format-kind', 'format', 'positive', pkg.formatWeight, formatClause(kind));
      if (kind === 'java-archive') add('java-runtime', 'role', 'informational', 0, 'requires Java to be installed');
      if (roles.cli) add('role-cli', 'role', 'informational', 0, 'Command-line application — opens in a terminal');
      for (const role of roles.penalized) {
        if (role === 'nightly' && prefs.releaseChannel !== 'stable') continue;
        add(`role-${role}`, 'role', 'negative', ROLE_PENALTIES[role], PENALTY_CLAUSES[role]);
      }
      if (roles.portable && prefs.packagePreference === 'portable') {
        add('pref-portable', 'preference', 'positive', PORTABLE_PREFERRED_BONUS, 'is a portable version, which you prefer');
      }
    }
  }

  const score = evidence.reduce(
    (sum, e) => (e.effect === 'positive' || e.effect === 'negative' ? sum + e.weight : sum),
    0,
  );

  return {
    assetId: asset.assetId,
    name: asset.name,
    label: asset.label ?? null,
    size: asset.size,
    downloadCount: asset.downloadCount,
    downloadUrl: asset.downloadUrl,
    detectedOperatingSystems: os.systems,
    detectedArchitectures: arch.architectures,
    packageKind: kind,
    roles: roles.roles,
    eligible,
    score,
    evidence,
  };
}
