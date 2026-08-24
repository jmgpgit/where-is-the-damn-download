/**
 * Selection policy: drop prereleases unless the caller opted in, then pick
 * the newest by publishedAt. GitHub emits publishedAt as UTC ISO-8601, so
 * string comparison orders correctly. A null publishedAt sorts last; exact
 * ties break toward the higher id so the pick is deterministic. Drafts never
 * reach this layer (api-validation rejects them).
 */

import type { ReleaseInfo } from '../shared/messages';

export function selectRelease(releases: ReleaseInfo[], includePrerelease: boolean): ReleaseInfo | null {
  let best: ReleaseInfo | null = null;
  for (const release of releases) {
    if (release.prerelease && !includePrerelease) continue;
    if (best === null || isNewer(release, best)) best = release;
  }
  return best;
}

export function prereleaseExists(releases: ReleaseInfo[]): boolean {
  return releases.some((release) => release.prerelease);
}

function isNewer(a: ReleaseInfo, b: ReleaseInfo): boolean {
  if (a.publishedAt !== b.publishedAt) {
    if (a.publishedAt === null) return false;
    if (b.publishedAt === null) return true;
    return a.publishedAt > b.publishedAt;
  }
  return a.id > b.id;
}
