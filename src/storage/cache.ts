/**
 * Release cache in storage.local. Entries are versioned envelopes; anything
 * unreadable (wrong version, malformed, expired) is a miss and removed
 * best-effort. Negative results (no releases, missing repo) are cached briefly
 * so a popular dead link does not hammer the GitHub API.
 */

import type { ReleaseInfo, ReleaseSelector } from '../shared/messages';
import type { StorageAreaLike } from './settings';

export const CACHE_SCHEMA_VERSION = 1;
export const FRESH_MS = 60 * 60 * 1000;
export const STALE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
export const NEGATIVE_MS = 20 * 60 * 1000;
export const MAX_ENTRIES = 64;

// Callers bind ext.storage.local themselves; see the note in ./settings.
const KEY_PREFIX = 'wtd:release:';

export type NegativeStatus = 'no-releases' | 'repo-not-found' | 'no-stable-release';

export type CacheLookup =
  | { state: 'fresh' | 'stale'; release: ReleaseInfo; etag: string | null }
  | { state: 'negative'; status: NegativeStatus; prereleaseAvailable?: boolean }
  | { state: 'miss' };

interface ReleaseEntry {
  v: number;
  storedAt: number;
  kind: 'release';
  release: ReleaseInfo;
  etag: string | null;
}

interface NegativeEntry {
  v: number;
  storedAt: number;
  kind: 'negative';
  status: NegativeStatus;
  prereleaseAvailable?: boolean;
}

type CacheEntry = ReleaseEntry | NegativeEntry;

/** Owner/repo are case-insensitive on GitHub; tags are not. */
export function cacheKey(owner: string, repo: string, selector: ReleaseSelector): string {
  const base = `${KEY_PREFIX}${owner.toLowerCase()}/${repo.toLowerCase()}`;
  switch (selector.kind) {
    case 'latest':
      return `${base}:latest`;
    case 'tag':
      return `${base}:tag:${selector.tag}`;
    case 'latest-including-prerelease':
      return `${base}:prerelease`;
  }
}

const NEGATIVE_STATUSES: readonly string[] = ['no-releases', 'repo-not-found', 'no-stable-release'];

/** Shallow shape check; the release payload was validated before it was stored. */
function isEntry(value: unknown): value is CacheEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v['v'] !== CACHE_SCHEMA_VERSION || typeof v['storedAt'] !== 'number') return false;
  if (v['kind'] === 'release') {
    return (
      typeof v['release'] === 'object' &&
      v['release'] !== null &&
      (v['etag'] === null || typeof v['etag'] === 'string')
    );
  }
  return v['kind'] === 'negative' && NEGATIVE_STATUSES.includes(v['status'] as string);
}

function discard(area: StorageAreaLike, key: string): void {
  // Best-effort: a failed cleanup just leaves garbage for the next lookup.
  void area.remove(key).catch(() => {});
}

export async function lookupRelease(
  area: StorageAreaLike,
  key: string,
  now: number,
): Promise<CacheLookup> {
  let raw: Record<string, unknown>;
  try {
    raw = await area.get(key);
  } catch {
    return { state: 'miss' };
  }
  const entry = raw[key];
  if (entry === undefined) return { state: 'miss' };
  if (!isEntry(entry)) {
    discard(area, key);
    return { state: 'miss' };
  }
  const age = now - entry.storedAt;
  if (entry.kind === 'negative') {
    if (age >= NEGATIVE_MS) {
      discard(area, key);
      return { state: 'miss' };
    }
    const hit: CacheLookup = { state: 'negative', status: entry.status };
    if (entry.prereleaseAvailable !== undefined) hit.prereleaseAvailable = entry.prereleaseAvailable;
    return hit;
  }
  if (age >= STALE_MAX_MS) {
    discard(area, key);
    return { state: 'miss' };
  }
  return { state: age < FRESH_MS ? 'fresh' : 'stale', release: entry.release, etag: entry.etag };
}

export async function storeRelease(
  area: StorageAreaLike,
  key: string,
  release: ReleaseInfo,
  etag: string | null,
  now: number,
): Promise<void> {
  const entry: ReleaseEntry = { v: CACHE_SCHEMA_VERSION, storedAt: now, kind: 'release', release, etag };
  await area.set({ [key]: entry });
  await prune(area);
}

export async function storeNegative(
  area: StorageAreaLike,
  key: string,
  status: NegativeStatus,
  now: number,
  prereleaseAvailable?: boolean,
): Promise<void> {
  const entry: NegativeEntry = { v: CACHE_SCHEMA_VERSION, storedAt: now, kind: 'negative', status };
  if (prereleaseAvailable !== undefined) entry.prereleaseAvailable = prereleaseAvailable;
  await area.set({ [key]: entry });
  await prune(area);
}

/** Evict oldest cache entries beyond MAX_ENTRIES; unreadable ones go first. */
async function prune(area: StorageAreaLike): Promise<void> {
  try {
    const all = await area.get(null);
    const entries: { key: string; storedAt: number }[] = [];
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith(KEY_PREFIX)) continue;
      const storedAt =
        typeof value === 'object' &&
        value !== null &&
        typeof (value as Record<string, unknown>)['storedAt'] === 'number'
          ? ((value as Record<string, unknown>)['storedAt'] as number)
          : 0;
      entries.push({ key, storedAt });
    }
    if (entries.length <= MAX_ENTRIES) return;
    entries.sort((a, b) => a.storedAt - b.storedAt);
    await area.remove(entries.slice(0, entries.length - MAX_ENTRIES).map((e) => e.key));
  } catch {
    // Pruning must never fail a store.
  }
}
