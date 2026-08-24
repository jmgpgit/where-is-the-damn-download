/**
 * Beginner sentences generated from the evidence trail. Nothing here decides
 * anything; it only phrases what scoring already recorded.
 */

import type { ClassifiedAsset, Confidence, UserPreferences } from './asset-types';

/**
 * Why this file, not what you asked for. The preference clause is left out on
 * purpose: "is a standard installer, and is an installer, which you prefer"
 * says the same thing twice, and the setting is on screen anyway.
 */
const PRIMARY_CATEGORIES: ReadonlySet<string> = new Set(['os', 'architecture', 'format']);

function joinClauses(clauses: readonly string[]): string {
  if (clauses.length <= 1) return clauses[0] ?? '';
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`;
}

/** e.g. "Recommended because it is marked for Windows, matches your 64-bit computer, and is a standard installer." */
export function explainPrimary(asset: ClassifiedAsset): string {
  const clauses = asset.evidence
    .filter((e) => e.effect === 'positive' && PRIMARY_CATEGORIES.has(e.category))
    .map((e) => e.explanation);
  if (clauses.length === 0) return 'Recommended because it is the closest match in this release.';
  return `Recommended because it ${joinClauses(clauses)}.`;
}

/** Reasons the asset was pushed down or flagged, one per line; empty when clean. */
export function explainCaveats(asset: ClassifiedAsset): string[] {
  return asset.evidence
    .filter((e) => e.effect === 'negative' || e.effect === 'informational')
    .map((e) => (e.effect === 'negative' ? `It ${e.explanation}.` : e.explanation));
}

export function explainExclusion(asset: ClassifiedAsset): string {
  const exclusion = asset.evidence.find((e) => e.effect === 'exclude');
  return exclusion?.explanation ?? 'Not recommended for this computer.';
}

/** Variant tie (user vs machine setup, msvc vs gnu…) settled by popularity. */
export function explainVariantTieBreak(other: ClassifiedAsset): string {
  return `Chosen over ${other.name} because more people downloaded it.`;
}

export function buildWarnings(
  primary: ClassifiedAsset | undefined,
  prefs: UserPreferences,
): string[] {
  if (primary === undefined) return [];
  const warnings: string[] = [];
  if (primary.evidence.some((e) => e.ruleId === 'arch-32-on-64')) {
    warnings.push('This is a 32-bit build on a 64-bit computer. It should still run.');
  }
  if (primary.packageKind === 'java-archive') {
    warnings.push('This program needs Java installed to run.');
  }
  if (primary.roles.includes('cli')) {
    warnings.push('Command-line application — opens in a terminal.');
  } else if (primary.roles.includes('cli-shaped')) {
    // Inferred from packaging, so it hedges and says what to expect either way.
    warnings.push(
      'This looks like a command-line tool: it probably opens a terminal window instead of a normal program window.',
    );
  }
  if (primary.roles.includes('script')) {
    warnings.push('This is a script that runs in a terminal, not an installer.');
  }
  if (
    prefs.packagePreference === 'installer' &&
    (primary.packageKind === 'portable-archive' || primary.roles.includes('portable'))
  ) {
    warnings.push('This is a portable version, not an installer. You may need to unzip it first.');
  }
  return warnings;
}

export function buildSummary(confidence: Confidence, primary: ClassifiedAsset | undefined): string {
  if (primary === undefined) return 'This release has no ready-to-run download for your computer.';
  switch (confidence) {
    case 'high':
      return `${primary.name} looks like the right download for your computer.`;
    case 'medium':
      return `${primary.name} is probably the right download for your computer.`;
    default:
      return `We are not sure which download fits your computer; ${primary.name} is our best guess.`;
  }
}
