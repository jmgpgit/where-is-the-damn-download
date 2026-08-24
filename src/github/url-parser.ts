/**
 * Recognizes the GitHub page kinds the extension acts on.
 *
 * Pure URL analysis; anything ambiguous, off-domain, or GitHub-reserved
 * degrades to 'unsupported' rather than guessing.
 */

import { isValidOwner, isValidRepo, isValidTag } from '../shared/messages';

export type GitHubPageContext =
  | { kind: 'repository-home'; owner: string; repo: string }
  | { kind: 'releases-list'; owner: string; repo: string }
  | { kind: 'latest-release'; owner: string; repo: string }
  | { kind: 'release-tag'; owner: string; repo: string; tag: string }
  | { kind: 'unsupported' };

/** First path segments GitHub keeps for its own routes — never a user login. */
const RESERVED_FIRST_SEGMENTS = new Set([
  'settings',
  'orgs',
  'organizations',
  'marketplace',
  'topics',
  'features',
  'about',
  'pricing',
  'login',
  'logout',
  'join',
  'signup',
  'explore',
  'notifications',
  'sponsors',
  'apps',
  'search',
  'trending',
  'collections',
  'events',
  'codespaces',
  'issues',
  'pulls',
  'new',
  'dashboard',
  'account',
  'enterprise',
  'enterprises',
  'customer-stories',
  'security',
  'team',
  'contact',
  'site',
  'blog',
  'readme',
  'home',
  'nonprofit',
  'open-source',
  'premium-support',
  'sitemap',
  'stars',
  'watching',
]);

const UNSUPPORTED: GitHubPageContext = { kind: 'unsupported' };

export function parsePageContext(url: string | URL): GitHubPageContext {
  let parsed: URL;
  try {
    parsed = typeof url === 'string' ? new URL(url) : url;
  } catch {
    return UNSUPPORTED;
  }
  if (parsed.hostname !== 'github.com') return UNSUPPORTED;

  const segments = parsed.pathname.split('/').filter((s) => s.length > 0);
  const [owner, rawRepo, third, fourth] = segments;
  if (owner === undefined || rawRepo === undefined) return UNSUPPORTED;
  if (owner.startsWith('.') || RESERVED_FIRST_SEGMENTS.has(owner.toLowerCase())) {
    return UNSUPPORTED;
  }
  if (!isValidOwner(owner)) return UNSUPPORTED;

  if (segments.length === 2) {
    // GitHub serves the repository home for clone-style URLs ending in .git.
    const repo = rawRepo.endsWith('.git') ? rawRepo.slice(0, -4) : rawRepo;
    return isValidRepo(repo) ? { kind: 'repository-home', owner, repo } : UNSUPPORTED;
  }

  if (!isValidRepo(rawRepo) || third !== 'releases') return UNSUPPORTED;
  if (segments.length === 3) return { kind: 'releases-list', owner, repo: rawRepo };
  if (segments.length === 4 && fourth === 'latest') {
    return { kind: 'latest-release', owner, repo: rawRepo };
  }
  if (segments.length >= 5 && fourth === 'tag') {
    // Tags may contain slashes: the remaining segments are one tag. Each
    // segment is percent-decoded so /tag/foo%2Fbar and /tag/foo/bar agree.
    let tag: string;
    try {
      tag = segments
        .slice(4)
        .map((segment) => decodeURIComponent(segment))
        .join('/');
    } catch {
      return UNSUPPORTED;
    }
    return isValidTag(tag) ? { kind: 'release-tag', owner, repo: rawRepo, tag } : UNSUPPORTED;
  }
  return UNSUPPORTED;
}
