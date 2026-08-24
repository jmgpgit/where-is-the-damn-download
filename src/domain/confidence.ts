/**
 * Confidence from evidence and margin, never from the raw score alone: a lone
 * generic zip scores "best" but we still should not sound sure about it.
 */

import type { ClassifiedAsset, Confidence, PackageKind } from './asset-types';
import { FORMAT_RANK } from './rules';

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

const hasOsEvidence = (asset: ClassifiedAsset): boolean =>
  hasRule(asset, 'os-token') || hasRule(asset, 'os-extension');

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Same kind, OS and architecture evidence: user vs machine setup, msvc vs gnu, lts, mono, Ubuntu 24.04 vs 26.04. */
export function isVariantOf(a: ClassifiedAsset, b: ClassifiedAsset): boolean {
  return (
    a.packageKind === b.packageKind &&
    sameSet(a.detectedOperatingSystems, b.detectedOperatingSystems) &&
    sameSet(a.detectedArchitectures, b.detectedArchitectures)
  );
}

const friendliness = (asset: ClassifiedAsset): number => FORMAT_RANK[asset.packageKind] ?? 0;

/** `ranked` is the eligible list, best first. */
export function assessConfidence(ranked: readonly ClassifiedAsset[]): Confidence {
  const primary = ranked[0];
  if (primary === undefined) return 'none';
  if (!hasOsEvidence(primary)) return 'low';

  // variants of the primary are settled by downloads, not a sign of ambiguity
  const others = ranked.slice(1).filter((a) => !isVariantOf(primary, a));
  // only a rival at least as beginner-friendly, and not a 32-bit stand-in, makes the pick ambiguous
  const rival = others.find(
    (a) => friendliness(a) >= friendliness(primary) && !hasRule(a, 'arch-32-on-64'),
  );
  if (rival !== undefined && primary.score - rival.score < NEAR_TIE) return 'low';

  const archKnown = hasRule(primary, 'arch-exact') || hasRule(primary, 'arch-universal');
  if (!archKnown) {
    // several arch-specific builds for this OS exist and we cannot tell which this one is
    const variants = new Set<string>();
    for (const asset of ranked) {
      if (!hasOsEvidence(asset)) continue;
      for (const arch of asset.detectedArchitectures) if (arch !== 'universal') variants.add(arch);
    }
    if (variants.size >= 2) return 'low';
  }

  const suspicious = primary.evidence.some((e) => e.category === 'role' && e.effect === 'negative');
  const contradiction = hasRule(primary, 'arch-32-on-64');
  const runnerUp = others[0];
  const margin = runnerUp === undefined ? Number.POSITIVE_INFINITY : primary.score - runnerUp.score;
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
