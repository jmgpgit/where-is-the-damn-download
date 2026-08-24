import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GITHUB_API_VERSION,
  fetchLatestRelease,
  fetchReleaseByTag,
  fetchReleaseList,
  type FetchLike,
} from '../src/github/api-client';

interface Call {
  url: string;
  init: RequestInit;
}

function mockFetch(response: Response): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(response);
    },
  };
}

function headersOf(call: Call | undefined): Record<string, string> {
  if (call === undefined) throw new Error('fetch was not called');
  return call.init.headers as Record<string, string>;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('outcome mapping', () => {
  it('200 with ETag returns ok with parsed json and the etag', async () => {
    const { fetch } = mockFetch(
      new Response(JSON.stringify({ id: 7 }), { status: 200, headers: { etag: 'W/"abc123"' } }),
    );
    await expect(fetchLatestRelease(fetch, 'acme', 'widget')).resolves.toEqual({
      kind: 'ok',
      json: { id: 7 },
      etag: 'W/"abc123"',
    });
  });

  it('200 without ETag returns etag null', async () => {
    const { fetch } = mockFetch(new Response('[]', { status: 200 }));
    await expect(fetchReleaseList(fetch, 'acme', 'widget')).resolves.toEqual({
      kind: 'ok',
      json: [],
      etag: null,
    });
  });

  it('304 returns not-modified', async () => {
    const { fetch } = mockFetch(new Response(null, { status: 304 }));
    await expect(fetchLatestRelease(fetch, 'acme', 'widget', 'W/"abc123"')).resolves.toEqual({
      kind: 'not-modified',
    });
  });

  it('404 returns not-found', async () => {
    const { fetch } = mockFetch(new Response(null, { status: 404 }));
    await expect(fetchLatestRelease(fetch, 'acme', 'widget')).resolves.toEqual({ kind: 'not-found' });
  });

  it('403 with exhausted quota returns rate-limited with resetAt from x-ratelimit-reset', async () => {
    const { fetch } = mockFetch(
      new Response(null, {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1756000000' },
      }),
    );
    await expect(fetchLatestRelease(fetch, 'acme', 'widget')).resolves.toEqual({
      kind: 'rate-limited',
      resetAt: 1_756_000_000_000,
    });
  });

  it('429 with Retry-After returns rate-limited with resetAt relative to now', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_756_000_000_000);
    const { fetch } = mockFetch(new Response(null, { status: 429, headers: { 'retry-after': '120' } }));
    await expect(fetchLatestRelease(fetch, 'acme', 'widget')).resolves.toEqual({
      kind: 'rate-limited',
      resetAt: 1_756_000_000_000 + 120_000,
    });
  });

  it('403 without rate-limit markers returns server-error', async () => {
    const { fetch } = mockFetch(new Response(null, { status: 403 }));
    await expect(fetchLatestRelease(fetch, 'acme', 'widget')).resolves.toEqual({ kind: 'server-error' });
  });

  it('500 returns server-error', async () => {
    const { fetch } = mockFetch(new Response(null, { status: 500 }));
    await expect(fetchLatestRelease(fetch, 'acme', 'widget')).resolves.toEqual({ kind: 'server-error' });
  });

  it('502 returns server-error', async () => {
    const { fetch } = mockFetch(new Response(null, { status: 502 }));
    await expect(fetchLatestRelease(fetch, 'acme', 'widget')).resolves.toEqual({ kind: 'server-error' });
  });

  it('a rejecting fetch returns network-error', async () => {
    const fetch: FetchLike = () => Promise.reject(new Error('offline'));
    await expect(fetchLatestRelease(fetch, 'acme', 'widget')).resolves.toEqual({ kind: 'network-error' });
  });

  it('a 200 body that is not JSON returns invalid-json', async () => {
    const { fetch } = mockFetch(new Response('<!doctype html>', { status: 200 }));
    await expect(fetchLatestRelease(fetch, 'acme', 'widget')).resolves.toEqual({ kind: 'invalid-json' });
  });

  it('aborts a hung fetch after 10 seconds and returns network-error', async () => {
    vi.useFakeTimers();
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const pending = fetchLatestRelease(fetch, 'acme', 'widget');
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toEqual({ kind: 'network-error' });
  });
});

describe('request shape', () => {
  it('sends the GitHub media type and pinned API version', async () => {
    const { fetch, calls } = mockFetch(new Response('{}', { status: 200 }));
    await fetchLatestRelease(fetch, 'acme', 'widget');
    const headers = headersOf(calls[0]);
    expect(headers['Accept']).toBe('application/vnd.github+json');
    expect(headers['X-GitHub-Api-Version']).toBe(GITHUB_API_VERSION);
    expect(headers['If-None-Match']).toBeUndefined();
  });

  it('sends If-None-Match only when an etag is passed', async () => {
    const { fetch, calls } = mockFetch(new Response(null, { status: 304 }));
    await fetchLatestRelease(fetch, 'acme', 'widget', 'W/"abc123"');
    expect(headersOf(calls[0])['If-None-Match']).toBe('W/"abc123"');
  });

  it('builds the latest-release URL', async () => {
    const { fetch, calls } = mockFetch(new Response('{}', { status: 200 }));
    await fetchLatestRelease(fetch, 'acme', 'widget');
    expect(calls[0]?.url).toBe('https://api.github.com/repos/acme/widget/releases/latest');
  });

  it('builds the tag URL with the tag encoded as one segment', async () => {
    const { fetch, calls } = mockFetch(new Response('{}', { status: 200 }));
    await fetchReleaseByTag(fetch, 'acme', 'widget', 'releases/v1.0');
    expect(calls[0]?.url).toBe(
      'https://api.github.com/repos/acme/widget/releases/tags/releases%2Fv1.0',
    );
  });

  it('builds the list URL with per_page=15', async () => {
    const { fetch, calls } = mockFetch(new Response('[]', { status: 200 }));
    await fetchReleaseList(fetch, 'acme', 'widget');
    expect(calls[0]?.url).toBe('https://api.github.com/repos/acme/widget/releases?per_page=15');
  });
});
