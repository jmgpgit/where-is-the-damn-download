/**
 * Fetch + validate + cache + dedup, composed per request. Owns every GitHub
 * API call in the extension; content scripts only ever send identifiers.
 *
 * Cache policy (see also storage/cache.ts): fresh <=1h answers without a
 * request; stale entries revalidate with If-None-Match; any failure falls
 * back to stale data <=7d, labelled stale; 404s are negative-cached.
 * Unauthenticated 304s still count against GitHub's 60/hr limit, so nothing
 * revalidates inside the fresh window.
 */

import {
  fetchLatestRelease,
  fetchReleaseByTag,
  fetchReleaseList,
  type FetchLike,
} from '../github/api-client';
import { validateRelease, validateReleaseList } from '../github/api-validation';
import { selectRelease } from '../github/release-selector';
import {
  cacheKey,
  lookupRelease,
  storeNegative,
  storeRelease,
  type CacheLookup,
} from '../storage/cache';
import type { StorageAreaLike } from '../storage/settings';
import type { ReleaseResult, ReleaseSelector } from '../shared/messages';
import { debug } from '../shared/logging';

export interface ReleaseServiceDeps {
  fetchImpl: FetchLike;
  area: StorageAreaLike;
  now(): number;
}

/** Best-effort: lives only as long as the worker; a restart may duplicate one fetch. */
const inFlight = new Map<string, Promise<ReleaseResult>>();
/** Manual-refresh throttle per cache key. */
const lastForced = new Map<string, number>();
const FORCE_MIN_INTERVAL_MS = 30_000;

export function resetForTests(): void {
  inFlight.clear();
  lastForced.clear();
}

export async function getRelease(
  deps: ReleaseServiceDeps,
  owner: string,
  repo: string,
  selector: ReleaseSelector,
  forceRefresh = false
): Promise<ReleaseResult> {
  const key = cacheKey(owner, repo, selector);

  if (forceRefresh) {
    const last = lastForced.get(key) ?? 0;
    if (deps.now() - last < FORCE_MIN_INTERVAL_MS) forceRefresh = false;
    else lastForced.set(key, deps.now());
  }

  const existing = inFlight.get(key);
  if (existing && !forceRefresh) return existing;

  const promise = compute(deps, owner, repo, selector, key, forceRefresh).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

function staleFallback(cached: CacheLookup, otherwise: ReleaseResult): ReleaseResult {
  if (cached.state === 'fresh' || cached.state === 'stale') {
    return { status: 'ok', release: cached.release, stale: true };
  }
  return otherwise;
}

function negativeResult(cached: Extract<CacheLookup, { state: 'negative' }>): ReleaseResult {
  if (cached.status === 'no-stable-release') {
    return { status: 'no-stable-release', prereleaseAvailable: cached.prereleaseAvailable ?? false };
  }
  return { status: cached.status };
}

async function compute(
  deps: ReleaseServiceDeps,
  owner: string,
  repo: string,
  selector: ReleaseSelector,
  key: string,
  forceRefresh: boolean
): Promise<ReleaseResult> {
  const cached = await lookupRelease(deps.area, key, deps.now());
  if (!forceRefresh) {
    if (cached.state === 'fresh') return { status: 'ok', release: cached.release, stale: false };
    if (cached.state === 'negative') return negativeResult(cached);
  }
  const etag = cached.state === 'fresh' || cached.state === 'stale' ? cached.etag : null;

  if (selector.kind === 'latest-including-prerelease') {
    return computeFromList(deps, owner, repo, key, cached);
  }

  const outcome =
    selector.kind === 'tag'
      ? await fetchReleaseByTag(deps.fetchImpl, owner, repo, selector.tag, etag)
      : await fetchLatestRelease(deps.fetchImpl, owner, repo, etag);

  switch (outcome.kind) {
    case 'ok': {
      const validated = validateRelease(outcome.json, owner, repo);
      if (!validated.ok) {
        debug('release validation failed', validated.error);
        return staleFallback(cached, { status: 'invalid-response' });
      }
      await storeRelease(deps.area, key, validated.value, outcome.etag, deps.now());
      return { status: 'ok', release: validated.value, stale: false };
    }
    case 'not-modified': {
      if (cached.state === 'fresh' || cached.state === 'stale') {
        // Restart the freshness window; the content is unchanged.
        await storeRelease(deps.area, key, cached.release, cached.etag, deps.now());
        return { status: 'ok', release: cached.release, stale: false };
      }
      return { status: 'invalid-response' };
    }
    case 'not-found':
      return handleNotFound(deps, owner, repo, selector, key);
    case 'rate-limited':
      return staleFallback(cached, { status: 'rate-limited', resetAt: outcome.resetAt });
    case 'server-error':
      return staleFallback(cached, { status: 'github-error' });
    case 'network-error':
      return staleFallback(cached, { status: 'network-error' });
    case 'invalid-json':
      return staleFallback(cached, { status: 'invalid-response' });
  }
}

/** The prerelease channel always works from the release list. */
async function computeFromList(
  deps: ReleaseServiceDeps,
  owner: string,
  repo: string,
  key: string,
  cached: CacheLookup
): Promise<ReleaseResult> {
  const outcome = await fetchReleaseList(deps.fetchImpl, owner, repo);
  switch (outcome.kind) {
    case 'ok': {
      const validated = validateReleaseList(outcome.json, owner, repo);
      if (!validated.ok) return staleFallback(cached, { status: 'invalid-response' });
      const release = selectRelease(validated.value, true);
      if (!release) {
        await storeNegative(deps.area, key, 'no-releases', deps.now());
        return { status: 'no-releases' };
      }
      await storeRelease(deps.area, key, release, null, deps.now());
      return { status: 'ok', release, stale: false };
    }
    case 'not-found': {
      await storeNegative(deps.area, key, 'repo-not-found', deps.now());
      return { status: 'repo-not-found' };
    }
    case 'not-modified':
      return staleFallback(cached, { status: 'invalid-response' });
    case 'rate-limited':
      return staleFallback(cached, { status: 'rate-limited', resetAt: outcome.resetAt });
    case 'server-error':
      return staleFallback(cached, { status: 'github-error' });
    case 'network-error':
      return staleFallback(cached, { status: 'network-error' });
    case 'invalid-json':
      return staleFallback(cached, { status: 'invalid-response' });
  }
}

/**
 * A 404 from /releases/latest means "no stable release", not necessarily "no
 * releases": one bounded list request tells prereleases apart from nothing
 * and from a missing repository.
 */
async function handleNotFound(
  deps: ReleaseServiceDeps,
  owner: string,
  repo: string,
  selector: ReleaseSelector,
  key: string
): Promise<ReleaseResult> {
  if (selector.kind === 'tag') {
    await storeNegative(deps.area, key, 'no-releases', deps.now());
    return { status: 'no-releases' };
  }

  const outcome = await fetchReleaseList(deps.fetchImpl, owner, repo);
  switch (outcome.kind) {
    case 'ok': {
      const validated = validateReleaseList(outcome.json, owner, repo);
      if (!validated.ok) return { status: 'invalid-response' };
      if (validated.value.length === 0) {
        await storeNegative(deps.area, key, 'no-releases', deps.now());
        return { status: 'no-releases' };
      }
      await storeNegative(deps.area, key, 'no-stable-release', deps.now(), true);
      return { status: 'no-stable-release', prereleaseAvailable: true };
    }
    case 'not-found':
      await storeNegative(deps.area, key, 'repo-not-found', deps.now());
      return { status: 'repo-not-found' };
    case 'rate-limited':
      return { status: 'rate-limited', resetAt: outcome.resetAt };
    case 'server-error':
      return { status: 'github-error' };
    case 'network-error':
      return { status: 'network-error' };
    case 'not-modified':
    case 'invalid-json':
      // Only "no stable release" is known at this point; say no more than that.
      return { status: 'invalid-response' };
  }
}
