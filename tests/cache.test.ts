import { describe, expect, it } from 'vitest';
import type { ReleaseInfo } from '../src/shared/messages';
import type { StorageAreaLike } from '../src/storage/settings';
import {
  CACHE_SCHEMA_VERSION,
  FRESH_MS,
  MAX_ENTRIES,
  NEGATIVE_MS,
  STALE_MAX_MS,
  cacheKey,
  lookupRelease,
  storeNegative,
  storeRelease,
} from '../src/storage/cache';

function fakeArea(initial: Record<string, unknown> = {}): {
  area: StorageAreaLike;
  data: Record<string, unknown>;
} {
  const data: Record<string, unknown> = { ...initial };
  const area: StorageAreaLike = {
    async get(keys) {
      if (keys === null) return { ...data };
      const out: Record<string, unknown> = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (key in data) out[key] = data[key];
      }
      return out;
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
  };
  return { area, data };
}

const release: ReleaseInfo = {
  id: 1,
  tagName: 'v1.0.0',
  name: 'First',
  htmlUrl: 'https://github.com/owner/repo/releases/tag/v1.0.0',
  prerelease: false,
  publishedAt: '2026-01-01T00:00:00Z',
  assets: [],
};

const T0 = 1_000_000;
const KEY = cacheKey('owner', 'repo', { kind: 'latest' });

describe('cacheKey', () => {
  it('lowercases owner and repo', () => {
    expect(cacheKey('OwNeR', 'RePo', { kind: 'latest' })).toBe('wtd:release:owner/repo:latest');
  });

  it('distinguishes selectors and preserves tag case', () => {
    const latest = cacheKey('o', 'r', { kind: 'latest' });
    const tag = cacheKey('o', 'r', { kind: 'tag', tag: 'V1.2' });
    const pre = cacheKey('o', 'r', { kind: 'latest-including-prerelease' });
    expect(tag).toBe('wtd:release:o/r:tag:V1.2');
    expect(pre).toBe('wtd:release:o/r:prerelease');
    expect(new Set([latest, tag, pre]).size).toBe(3);
  });
});

describe('lookupRelease', () => {
  it('misses on an empty area', async () => {
    const { area } = fakeArea();
    expect(await lookupRelease(area, KEY, T0)).toEqual({ state: 'miss' });
  });

  it('is fresh within FRESH_MS and carries the etag', async () => {
    const { area } = fakeArea();
    await storeRelease(area, KEY, release, '"abc"', T0);
    expect(await lookupRelease(area, KEY, T0 + FRESH_MS - 1)).toEqual({
      state: 'fresh',
      release,
      etag: '"abc"',
    });
  });

  it('is stale from FRESH_MS up to STALE_MAX_MS', async () => {
    const { area } = fakeArea();
    await storeRelease(area, KEY, release, null, T0);
    expect((await lookupRelease(area, KEY, T0 + FRESH_MS)).state).toBe('stale');
    expect((await lookupRelease(area, KEY, T0 + STALE_MAX_MS - 1)).state).toBe('stale');
  });

  it('misses after STALE_MAX_MS and removes the entry', async () => {
    const { area, data } = fakeArea();
    await storeRelease(area, KEY, release, null, T0);
    expect(await lookupRelease(area, KEY, T0 + STALE_MAX_MS)).toEqual({ state: 'miss' });
    expect(KEY in data).toBe(false);
  });

  it('serves a negative within NEGATIVE_MS, then misses', async () => {
    const { area } = fakeArea();
    await storeNegative(area, KEY, 'no-stable-release', T0, true);
    expect(await lookupRelease(area, KEY, T0 + NEGATIVE_MS - 1)).toEqual({
      state: 'negative',
      status: 'no-stable-release',
      prereleaseAvailable: true,
    });
    expect(await lookupRelease(area, KEY, T0 + NEGATIVE_MS)).toEqual({ state: 'miss' });
  });

  it('misses on a schema version mismatch', async () => {
    const { area, data } = fakeArea({
      [KEY]: { v: CACHE_SCHEMA_VERSION + 1, storedAt: T0, kind: 'release', release, etag: null },
    });
    expect(await lookupRelease(area, KEY, T0)).toEqual({ state: 'miss' });
    expect(KEY in data).toBe(false);
  });

  it('misses on a malformed entry', async () => {
    const { area } = fakeArea({ [KEY]: 'garbage' });
    expect(await lookupRelease(area, KEY, T0)).toEqual({ state: 'miss' });
  });
});

describe('pruning', () => {
  it('keeps only the newest MAX_ENTRIES cache entries', async () => {
    const { area, data } = fakeArea({ unrelated: 'left alone' });
    for (let i = 0; i <= MAX_ENTRIES; i++) {
      await storeRelease(area, cacheKey('o', `r${i}`, { kind: 'latest' }), release, null, T0 + i);
    }
    const cacheKeys = Object.keys(data).filter((k) => k.startsWith('wtd:release:'));
    expect(cacheKeys.length).toBe(MAX_ENTRIES);
    expect(cacheKey('o', 'r0', { kind: 'latest' }) in data).toBe(false);
    expect(cacheKey('o', `r${MAX_ENTRIES}`, { kind: 'latest' }) in data).toBe(true);
    expect(data['unrelated']).toBe('left alone');
  });
});
