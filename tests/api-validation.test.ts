import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { validateRelease, validateReleaseList } from '../src/github/api-validation';
import type { Result } from '../src/shared/result';

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/release-responses/${name}`, import.meta.url), 'utf8'),
  );
}

function unwrap<T>(result: Result<T, string>): T {
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.value;
}

/** Minimal valid release the inline tests mutate. */
function baseRelease(assets: unknown[]): Record<string, unknown> {
  return {
    id: 1,
    tag_name: 'v1.0.0',
    name: 'v1.0.0',
    html_url: 'https://github.com/acme/widget/releases/tag/v1.0.0',
    draft: false,
    prerelease: false,
    published_at: '2026-01-01T00:00:00Z',
    assets,
  };
}

describe('validateRelease', () => {
  it('maps a full realistic latest-release response', () => {
    const release = unwrap(validateRelease(fixture('latest-release.json'), 'acme', 'widget'));
    expect(release.id).toBe(198234771);
    expect(release.tagName).toBe('v2.4.1');
    expect(release.name).toBe('Widget 2.4.1');
    expect(release.htmlUrl).toBe('https://github.com/acme/widget/releases/tag/v2.4.1');
    expect(release.prerelease).toBe(false);
    expect(release.publishedAt).toBe('2026-08-11T14:02:01Z');
    expect(release.assets.map((a) => a.id)).toEqual([501, 502, 503, 504]);

    const [exe, tarball] = release.assets;
    expect(exe).toEqual({
      id: 501,
      name: 'widget-2.4.1-setup-x64.exe',
      label: 'Windows installer (64-bit)',
      contentType: 'application/x-msdownload',
      size: 48211456,
      downloadCount: 15321,
      browserDownloadUrl:
        'https://github.com/acme/widget/releases/download/v2.4.1/widget-2.4.1-setup-x64.exe',
      digest: 'sha256:9f2c1b7a0d34e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4',
    });
    expect(tarball?.label).toBeNull();
    expect(tarball?.digest).toBeNull();
  });

  it('rejects a draft release', () => {
    const result = validateRelease(fixture('draft-release.json'), 'acme', 'widget');
    expect(result.ok).toBe(false);
  });

  it('rejects a release whose assets field is not an array', () => {
    const result = validateRelease(fixture('malformed-assets.json'), 'acme', 'widget');
    expect(result.ok).toBe(false);
  });

  it('drops hostile or incomplete assets but keeps the release', () => {
    const release = unwrap(validateRelease(fixture('dropped-assets.json'), 'acme', 'widget'));
    // 601 state 'starter', 602 http://, 603 evil.com, 604 wrong repo — all gone.
    expect(release.assets.map((a) => a.id)).toEqual([605]);
    expect(release.assets[0]?.digest).toBe(
      'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    );
  });

  it('rejects non-object json', () => {
    expect(validateRelease(null, 'acme', 'widget').ok).toBe(false);
    expect(validateRelease('[]', 'acme', 'widget').ok).toBe(false);
    expect(validateRelease(42, 'acme', 'widget').ok).toBe(false);
  });

  it('rejects a release missing required fields', () => {
    const noTag = baseRelease([]);
    delete noTag['tag_name'];
    expect(validateRelease(noTag, 'acme', 'widget').ok).toBe(false);
    expect(validateRelease({ ...baseRelease([]), id: 'x' }, 'acme', 'widget').ok).toBe(false);
    expect(validateRelease({ ...baseRelease([]), prerelease: 'no' }, 'acme', 'widget').ok).toBe(false);
  });

  it('rejects an html_url that is not https github.com', () => {
    expect(
      validateRelease({ ...baseRelease([]), html_url: 'http://github.com/acme/widget/releases/tag/v1' }, 'acme', 'widget').ok,
    ).toBe(false);
    expect(
      validateRelease({ ...baseRelease([]), html_url: 'https://evil.com/acme/widget/releases/tag/v1' }, 'acme', 'widget').ok,
    ).toBe(false);
    expect(validateRelease({ ...baseRelease([]), html_url: 'not a url' }, 'acme', 'widget').ok).toBe(false);
  });

  it('matches the download path prefix case-insensitively', () => {
    const release = unwrap(
      validateRelease(
        baseRelease([
          {
            id: 9,
            name: 'x.zip',
            state: 'uploaded',
            size: 10,
            download_count: 0,
            browser_download_url: 'https://github.com/ACME/Widget/releases/download/v1.0.0/x.zip',
          },
        ]),
        'acme',
        'widget',
      ),
    );
    expect(release.assets).toHaveLength(1);
  });

  it('drops assets with negative counters and nullifies malformed digests', () => {
    const release = unwrap(
      validateRelease(
        baseRelease([
          {
            id: 10,
            name: 'neg.zip',
            state: 'uploaded',
            size: -1,
            download_count: 0,
            browser_download_url: 'https://github.com/acme/widget/releases/download/v1.0.0/neg.zip',
          },
          {
            id: 11,
            name: 'ok.zip',
            state: 'uploaded',
            size: 10,
            download_count: 2,
            digest: 'md5:abcdef',
            browser_download_url: 'https://github.com/acme/widget/releases/download/v1.0.0/ok.zip',
          },
        ]),
        'acme',
        'widget',
      ),
    );
    expect(release.assets.map((a) => a.id)).toEqual([11]);
    expect(release.assets[0]?.digest).toBeNull();
  });
});

describe('validateReleaseList', () => {
  it('keeps valid entries and drops drafts and garbage', () => {
    const releases = unwrap(validateReleaseList(fixture('release-list.json'), 'acme', 'widget'));
    expect(releases.map((r) => r.id)).toEqual([198235100, 198234771]);
    expect(releases[0]?.prerelease).toBe(true);
  });

  it('rejects a non-array payload', () => {
    expect(validateReleaseList({ message: 'Not Found' }, 'acme', 'widget').ok).toBe(false);
  });
});
