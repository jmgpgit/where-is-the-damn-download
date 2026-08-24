/**
 * Minimal GitHub REST client.
 *
 * URLs are built only here, from already-validated identifiers, so callers
 * cannot use this module as a fetch proxy. fetch is injected: node tests pass
 * a mock, the background passes the platform fetch.
 */

export const GITHUB_API_VERSION = '2026-03-10';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type ApiOutcome =
  | { kind: 'ok'; json: unknown; etag: string | null }
  | { kind: 'not-modified' }
  | { kind: 'not-found' }
  | { kind: 'rate-limited'; resetAt: number | null }
  | { kind: 'server-error' }
  | { kind: 'network-error' }
  | { kind: 'invalid-json' };

const API_ROOT = 'https://api.github.com';
const TIMEOUT_MS = 10_000;

export function fetchLatestRelease(
  fetchImpl: FetchLike,
  owner: string,
  repo: string,
  etag?: string | null,
): Promise<ApiOutcome> {
  return request(fetchImpl, `${repoPath(owner, repo)}/releases/latest`, etag);
}

export function fetchReleaseByTag(
  fetchImpl: FetchLike,
  owner: string,
  repo: string,
  tag: string,
  etag?: string | null,
): Promise<ApiOutcome> {
  // The tag is one path segment; encoding keeps embedded slashes unambiguous.
  return request(fetchImpl, `${repoPath(owner, repo)}/releases/tags/${encodeURIComponent(tag)}`, etag);
}

export function fetchReleaseList(
  fetchImpl: FetchLike,
  owner: string,
  repo: string,
  etag?: string | null,
): Promise<ApiOutcome> {
  return request(fetchImpl, `${repoPath(owner, repo)}/releases?per_page=15`, etag);
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

async function request(
  fetchImpl: FetchLike,
  path: string,
  etag: string | null | undefined,
): Promise<ApiOutcome> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
  if (etag !== undefined && etag !== null && etag !== '') headers['If-None-Match'] = etag;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(API_ROOT + path, { headers, signal: controller.signal });
  } catch {
    // Aborts (our timeout) and transport failures land here alike.
    return { kind: 'network-error' };
  } finally {
    clearTimeout(timer);
  }
  return interpret(response);
}

async function interpret(response: Response): Promise<ApiOutcome> {
  const status = response.status;
  if (status === 304) return { kind: 'not-modified' };
  if (status === 404) return { kind: 'not-found' };
  if (status === 403 || status === 429) {
    const retryAfter = response.headers.get('retry-after');
    if (response.headers.get('x-ratelimit-remaining') === '0' || retryAfter !== null) {
      return {
        kind: 'rate-limited',
        resetAt: resetAtMs(response.headers.get('x-ratelimit-reset'), retryAfter),
      };
    }
    // A 403 without rate-limit markers is GitHub refusing us for other reasons.
    return { kind: 'server-error' };
  }
  if (!response.ok) return { kind: 'server-error' };

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { kind: 'invalid-json' };
  }
  return { kind: 'ok', json, etag: response.headers.get('etag') };
}

/** x-ratelimit-reset is epoch seconds; Retry-After is delay seconds or a date. */
function resetAtMs(reset: string | null, retryAfter: string | null): number | null {
  if (reset !== null) {
    const seconds = Number(reset);
    if (Number.isFinite(seconds)) return seconds * 1000;
  }
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Date.now() + seconds * 1000;
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return date;
  }
  return null;
}
