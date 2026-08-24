import { beforeEach, describe, expect, it } from 'vitest';
import { getRelease, resetForTests, type ReleaseServiceDeps } from '../src/background/release-service';
import type { FetchLike } from '../src/github/api-client';
import { FRESH_MS } from '../src/storage/cache';
import type { StorageAreaLike } from '../src/storage/settings';

function fakeArea(): StorageAreaLike & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    async get(keys) {
      const out: Record<string, unknown> = {};
      const list = keys === null ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
      for (const k of list) if (data.has(k)) out[k] = data.get(k);
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    },
    async remove(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k);
    },
  };
}

function releaseJson(tag = 'v1.0.0', prerelease = false): unknown {
  return {
    id: 100,
    tag_name: tag,
    name: tag,
    html_url: `https://github.com/o/r/releases/tag/${tag}`,
    draft: false,
    prerelease,
    published_at: '2026-01-01T00:00:00Z',
    assets: [
      {
        id: 1,
        name: 'app-setup-win64.exe',
        label: null,
        state: 'uploaded',
        content_type: 'application/octet-stream',
        size: 1000,
        download_count: 5,
        browser_download_url: `https://github.com/o/r/releases/download/${tag}/app-setup-win64.exe`,
      },
    ],
  };
}

type Call = { url: string; headers: Record<string, string> };

/** Queue of responses; each fetch shifts one. Records what was requested. */
function fakeFetch(queue: Array<() => Response | Promise<Response>>): FetchLike & { calls: Call[] } {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: (init.headers as Record<string, string>) ?? {} });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected fetch: ${url}`);
    return next();
  }) as FetchLike & { calls: Call[] };
  impl.calls = calls;
  return impl;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
const empty = (status: number, headers: Record<string, string> = {}) => () =>
  new Response(null, { status, headers });

describe('release-service', () => {
  let now: number;
  let area: ReturnType<typeof fakeArea>;
  const deps = (fetchImpl: FetchLike): ReleaseServiceDeps => ({
    fetchImpl,
    area,
    now: () => now,
  });

  beforeEach(() => {
    resetForTests();
    now = 1_700_000_000_000;
    area = fakeArea();
  });

  it('fetches once, then serves from the fresh cache', async () => {
    const fetchImpl = fakeFetch([json(releaseJson(), 200, { etag: '"abc"' })]);
    const first = await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' });
    expect(first).toMatchObject({ status: 'ok', stale: false });
    expect(fetchImpl.calls[0]?.url).toBe('https://api.github.com/repos/o/r/releases/latest');

    now += FRESH_MS / 2;
    const second = await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' });
    expect(second).toMatchObject({ status: 'ok', stale: false });
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it('revalidates stale entries with If-None-Match and honours 304', async () => {
    const fetchImpl = fakeFetch([json(releaseJson(), 200, { etag: '"abc"' }), empty(304)]);
    await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' });

    now += FRESH_MS * 2;
    const result = await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' });
    expect(result).toMatchObject({ status: 'ok', stale: false });
    expect(fetchImpl.calls[1]?.headers['If-None-Match']).toBe('"abc"');

    // 304 restarted the fresh window.
    now += FRESH_MS / 2;
    await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' });
    expect(fetchImpl.calls).toHaveLength(2);
  });

  it('serves stale data, labelled, when the network fails', async () => {
    const fetchImpl = fakeFetch([
      json(releaseJson(), 200, { etag: '"abc"' }),
      () => Promise.reject(new TypeError('offline')),
    ]);
    await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' });
    now += FRESH_MS * 3;
    const result = await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' });
    expect(result).toMatchObject({ status: 'ok', stale: true });
  });

  it('reports rate limiting when nothing is cached', async () => {
    const fetchImpl = fakeFetch([
      empty(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000600' }),
    ]);
    const result = await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' });
    expect(result).toEqual({ status: 'rate-limited', resetAt: 1_700_000_600_000 });
  });

  it('distinguishes no releases / prerelease-only / missing repo after a 404', async () => {
    let fetchImpl = fakeFetch([empty(404), json([])]);
    expect(await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' })).toEqual({
      status: 'no-releases',
    });
    // Negative-cached: no further fetches.
    expect(await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' })).toEqual({
      status: 'no-releases',
    });
    expect(fetchImpl.calls).toHaveLength(2);

    resetForTests();
    area = fakeArea();
    fetchImpl = fakeFetch([empty(404), json([releaseJson('v2.0.0-beta', true)])]);
    expect(await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' })).toEqual({
      status: 'no-stable-release',
      prereleaseAvailable: true,
    });

    resetForTests();
    area = fakeArea();
    fetchImpl = fakeFetch([empty(404), empty(404)]);
    expect(await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' })).toEqual({
      status: 'repo-not-found',
    });
  });

  it('does not claim "no releases" when the follow-up list probe fails', async () => {
    let fetchImpl = fakeFetch([empty(404), empty(500)]);
    expect(await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' })).toEqual({
      status: 'github-error',
    });

    resetForTests();
    area = fakeArea();
    fetchImpl = fakeFetch([
      empty(404),
      () => new Response('not json', { status: 200 }),
      empty(404),
      json([releaseJson('v2.0.0-beta', true)]),
    ]);
    expect(await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' })).toEqual({
      status: 'invalid-response',
    });
    // Nothing was negative-cached: the next run asks again and gets the truth.
    expect(await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' })).toEqual({
      status: 'no-stable-release',
      prereleaseAvailable: true,
    });
  });

  it('treats a missing tag as no release for that route', async () => {
    const fetchImpl = fakeFetch([empty(404)]);
    const result = await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'tag', tag: 'nope/v1' });
    expect(result).toEqual({ status: 'no-releases' });
    expect(fetchImpl.calls[0]?.url).toBe('https://api.github.com/repos/o/r/releases/tags/nope%2Fv1');
  });

  it('deduplicates concurrent requests for the same key', async () => {
    const fetchImpl = fakeFetch([json(releaseJson(), 200, { etag: '"abc"' })]);
    const [a, b, c] = await Promise.all([
      getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' }),
      getRelease(deps(fetchImpl), 'O', 'R', { kind: 'latest' }),
      getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' }),
    ]);
    expect(fetchImpl.calls).toHaveLength(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('honours a manual refresh once, then throttles it', async () => {
    const fetchImpl = fakeFetch([
      json(releaseJson(), 200, { etag: '"a"' }),
      json(releaseJson('v1.0.1'), 200, { etag: '"b"' }),
    ]);
    await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' });
    now += 1000;
    const refreshed = await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' }, true);
    expect(refreshed).toMatchObject({ status: 'ok', release: { tagName: 'v1.0.1' } });
    now += 1000;
    await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' }, true);
    expect(fetchImpl.calls).toHaveLength(2);
  });

  it('flags responses it cannot understand', async () => {
    const fetchImpl = fakeFetch([json({ nonsense: true })]);
    expect(await getRelease(deps(fetchImpl), 'o', 'r', { kind: 'latest' })).toEqual({
      status: 'invalid-response',
    });
  });

  it('uses the release list for the prerelease channel', async () => {
    const fetchImpl = fakeFetch([json([releaseJson('v1.0.0'), releaseJson('v1.1.0-rc1', true)])]);
    const result = await getRelease(deps(fetchImpl), 'o', 'r', {
      kind: 'latest-including-prerelease',
    });
    expect(fetchImpl.calls[0]?.url).toContain('/releases?per_page=');
    expect(result).toMatchObject({ status: 'ok' });
  });
});
