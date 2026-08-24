/**
 * Deterministic entry point: canonicalizes input order, classifies every asset
 * exactly once, ranks the eligible ones, and packages the answer.
 */

import type {
  AssetInput,
  ClassifiedAsset,
  PackageKind,
  Recommendation,
  UserPlatform,
  UserPreferences,
} from './asset-types';
import { assessConfidence } from './confidence';
import { buildSummary, buildWarnings } from './explanations';
import { PORTABLE_WHEN_INSTALLER_PREFERRED } from './rules';
import { classifyAsset } from './scoring';

const INSTALLER_KINDS: ReadonlySet<PackageKind> = new Set<PackageKind>([
  'windows-installer',
  'macos-installer',
  'linux-deb',
  'linux-rpm',
]);

// installer > executable > portable archive > generic archive > java
const FORMAT_RANK: Readonly<Partial<Record<PackageKind, number>>> = {
  'windows-installer': 5,
  'macos-installer': 5,
  'linux-deb': 5,
  'linux-rpm': 5,
  'windows-executable': 4,
  'macos-application': 4,
  'linux-appimage': 4,
  'portable-archive': 3,
  'generic-archive': 2,
  'java-archive': 1,
};

const hasRule = (asset: ClassifiedAsset, ruleId: string): boolean =>
  asset.evidence.some((e) => e.ruleId === ruleId);

const osRank = (a: ClassifiedAsset): number =>
  hasRule(a, 'os-token') ? 2 : hasRule(a, 'os-extension') ? 1 : 0;

const archRank = (a: ClassifiedAsset): number =>
  hasRule(a, 'arch-exact') || hasRule(a, 'arch-universal') ? 1 : 0;

const isPortable = (a: ClassifiedAsset): boolean =>
  a.packageKind === 'portable-archive' || a.roles.includes('portable');

function preferenceRank(a: ClassifiedAsset, prefs: UserPreferences): number {
  if (prefs.packagePreference === 'installer') return INSTALLER_KINDS.has(a.packageKind) ? 1 : 0;
  if (prefs.packagePreference === 'portable') return isPortable(a) ? 1 : 0;
  return 0;
}

function compareRanked(a: ClassifiedAsset, b: ClassifiedAsset, prefs: UserPreferences): number {
  if (a.score !== b.score) return b.score - a.score;
  const steps = [
    osRank(b) - osRank(a),
    archRank(b) - archRank(a),
    preferenceRank(b, prefs) - preferenceRank(a, prefs),
    (FORMAT_RANK[b.packageKind] ?? 0) - (FORMAT_RANK[a.packageKind] ?? 0),
    Number(a.roles.includes('debug')) - Number(b.roles.includes('debug')),
    b.downloadCount - a.downloadCount,
  ];
  for (const step of steps) if (step !== 0) return step;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.assetId - b.assetId;
}

export function recommend(
  assets: AssetInput[],
  platform: UserPlatform,
  prefs: UserPreferences,
): Recommendation {
  // input order must never leak into the result
  const canonical = [...assets].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : a.assetId - b.assetId,
  );
  const classified = canonical.map((asset) => classifyAsset(asset, platform, prefs));

  // portable penalty is relative: it only bites when a real installer competes
  if (
    prefs.packagePreference === 'installer' &&
    classified.some((c) => c.eligible && INSTALLER_KINDS.has(c.packageKind))
  ) {
    for (const c of classified) {
      if (!c.eligible || !c.roles.includes('portable')) continue;
      c.score += PORTABLE_WHEN_INSTALLER_PREFERRED;
      c.evidence.push({
        ruleId: 'pref-installer-over-portable',
        category: 'preference',
        effect: 'negative',
        weight: PORTABLE_WHEN_INSTALLER_PREFERRED,
        explanation: 'is a portable version, and this release also has an installer',
      });
    }
  }

  const eligible = classified.filter((c) => c.eligible).sort((a, b) => compareRanked(a, b, prefs));
  const excluded = classified.filter((c) => !c.eligible);
  const primary = eligible[0];
  const confidence = assessConfidence(eligible);

  const recommendation: Recommendation = {
    confidence,
    alternatives: eligible.slice(1),
    excluded,
    summary: buildSummary(confidence, primary),
    warnings: buildWarnings(primary, prefs),
  };
  if (primary !== undefined) recommendation.primary = primary;
  return recommendation;
}
