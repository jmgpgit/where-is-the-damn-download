/**
 * Every user-visible string and the branding, in one place, so the product
 * name can change without touching components. Beginner language throughout:
 * no scores, no jargon, no safety claims.
 */

import type { Confidence, OperatingSystem, Architecture, PackageKind } from '../domain/asset-types';

export const BRAND = {
  name: "Where's the Damn Download?",
  /** Neutral internal identifier: storage keys, CSS prefixes, attributes. */
  id: 'wheres-the-download',
} as const;

export const MOUNT_ATTR = 'data-wheres-the-download-root';

export const DISCLAIMERS = {
  compatibility:
    'This recommendation is based on file compatibility, not a security review of the project.',
  affiliation: 'Not affiliated with or endorsed by GitHub.',
} as const;

export const HEADINGS: Record<Confidence, string> = {
  high: 'Recommended download for this computer',
  medium: 'This is probably the right download',
  low: 'Several downloads may work',
  none: 'No ready-to-run download found',
};

export const STATES = {
  loading: 'Checking this release for a download…',
  noReleases: 'This repository does not appear to publish finished downloads through GitHub Releases.',
  noReleasesTitle: 'No GitHub Releases found',
  releaseNotFound: 'This release could not be found, or it has no downloads.',
  noCompatible:
    'The latest release does not appear to contain a compatible application for this computer. ' +
    'This repository may provide source code, developer packages, or builds through another website.',
  noStableRelease: 'No stable release is available.',
  noStableButPrerelease:
    'No stable release is available. A prerelease exists, but it may be unfinished. ' +
    'You can include prereleases in the settings below.',
  repoNotFound: 'Release information for this repository could not be found.',
  rateLimited:
    "GitHub's download information could not be refreshed because the API limit was reached. Try again later.",
  networkError: 'GitHub could not be reached. Check your connection and try again.',
  githubError: 'GitHub had a temporary problem answering. Try again later.',
  invalidResponse: 'GitHub sent an answer this extension could not understand.',
  stale: 'Showing cached release information from an earlier request.',
  prereleaseNotice: 'You are viewing a prerelease. It may be unfinished.',
  onlySource:
    'This release only provides source code through GitHub. A ready-to-run application was not attached.',
} as const;

export const LABELS = {
  download: 'Download',
  whyThisFile: 'Why this file?',
  otherDownloads: 'Other downloads',
  reviewChoices: 'Review the choices',
  detected: 'Detected',
  release: 'Release',
  latestStable: 'Latest stable release',
  refresh: 'Refresh',
  settings: 'Options',
  advancedMode: 'Advanced details',
  downloads: 'downloads',
  excluded: 'Not recommended',
  score: 'Score',
  evidence: 'Evidence',
  sourceBadge: 'Source code — usually not the installable application.',
  os: 'Operating system',
  arch: 'Architecture',
  packagePreference: 'Package preference',
  includePrereleases: 'Include prereleases',
  automatic: 'Automatic',
} as const;

export const OS_NAMES: Record<OperatingSystem, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android',
  chromeos: 'ChromeOS',
  openbsd: 'OpenBSD',
  unknown: 'Unknown system',
};

export const ARCH_NAMES: Record<Architecture, string> = {
  x64: '64-bit',
  arm64: 'ARM64',
  x86: '32-bit',
  arm: 'ARM',
  riscv64: 'RISC-V',
  universal: 'Universal',
  unknown: 'unknown architecture',
};

/** Beginner-facing package descriptions shown next to filenames. */
export const PACKAGE_NAMES: Record<PackageKind, string> = {
  'windows-installer': 'Windows installer',
  'windows-executable': 'Windows program',
  'portable-archive': 'Portable archive',
  'macos-installer': 'macOS installer',
  'macos-application': 'macOS application',
  'linux-appimage': 'Linux AppImage',
  'linux-deb': 'Debian/Ubuntu package',
  'linux-rpm': 'Fedora/RHEL package',
  'generic-archive': 'Archive',
  'java-archive': 'Java application — requires Java to be installed',
  source: 'Source code — for developers; usually not the application download',
  checksum: 'Checksum file — verifies another download',
  signature: 'Signature file — verifies another download',
  symbols: 'Debug symbols — for developers',
  sdk: 'Developer kit',
  'updater-metadata': 'Update metadata — used by the app itself',
  unknown: 'File',
};

export function describePlatform(os: OperatingSystem, arch: Architecture): string {
  if (os === 'unknown') return OS_NAMES.unknown;
  if (arch === 'unknown') return OS_NAMES[os];
  return `${OS_NAMES[os]} ${ARCH_NAMES[arch]}`;
}

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let unit = '';
  for (const u of units) {
    value /= 1024;
    unit = u;
    if (value < 1024) break;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${unit}`;
}

/** Fixed locale keeps output (and tests) deterministic. */
export function formatCount(count: number): string {
  return count.toLocaleString('en-US');
}
