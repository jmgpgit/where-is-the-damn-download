/**
 * Confidence from evidence and margin, never from the raw score alone: a lone
 * generic zip scores "best" but we still should not sound sure about it.
 */

import type { ClassifiedAsset, Confidence, PackageKind } from './asset-types';

const BEGINNER_KINDS: ReadonlySet<PackageKind> = new Set<PackageKind>([
  'windows-installer',
  'windows-executable',
  'macos-installer',
  'macos-application',
  'linux-appimage',
]);

const CLEAR_MARGIN = 15;
const NEAR_TIE = 8;

const hasRule = (asset: ClassifiedAsset, ruleId: string): boolean =>
  asset.evidence.some((e) => e.ruleId === ruleId);

/** `ranked` is the eligible list, best first. */
export function assessConfidence(ranked: readonly ClassifiedAsset[]): Confidence {
  const primary = ranked[0];
  if (primary === undefined) return 'none';
  const runnerUp = ranked[1];
  const margin = runnerUp === undefined ? Number.POSITIVE_INFINITY : primary.score - runnerUp.score;

  const osExplicit = hasRule(primary, 'os-token') || hasRule(primary, 'os-extension');
  if (!osExplicit) return 'low';
  if (margin < NEAR_TIE) return 'low';

  const archKnown = hasRule(primary, 'arch-exact') || hasRule(primary, 'arch-universal');
  if (!archKnown) {
    // several arch-specific builds exist and we cannot tell which this one is
    const variants = new Set<string>();
    for (const asset of ranked) {
      for (const arch of asset.detectedArchitectures) if (arch !== 'universal') variants.add(arch);
    }
    if (variants.size >= 2) return 'low';
  }

  const suspicious = primary.evidence.some((e) => e.category === 'role' && e.effect === 'negative');
  const contradiction = hasRule(primary, 'arch-32-on-64');
  if (
    archKnown &&
    !contradiction &&
    !suspicious &&
    BEGINNER_KINDS.has(primary.packageKind) &&
    margin >= CLEAR_MARGIN
  ) {
    return 'high';
  }
  return 'medium';
}
