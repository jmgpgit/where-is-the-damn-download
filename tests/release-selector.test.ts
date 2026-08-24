import { describe, expect, it } from 'vitest';

import { prereleaseExists, selectRelease } from '../src/github/release-selector';
import type { ReleaseInfo } from '../src/shared/messages';

function release(id: number, publishedAt: string | null, prerelease = false): ReleaseInfo {
  return {
    id,
    tagName: `v${id}`,
    name: null,
    htmlUrl: `https://github.com/acme/widget/releases/tag/v${id}`,
    prerelease,
    publishedAt,
    assets: [],
  };
}

describe('selectRelease', () => {
  it('returns null for an empty list', () => {
    expect(selectRelease([], false)).toBeNull();
  });

  it('skips prereleases when not included, even when they are newest', () => {
    const stable = release(1, '2026-01-01T00:00:00Z');
    const rc = release(2, '2026-06-01T00:00:00Z', true);
    expect(selectRelease([rc, stable], false)).toBe(stable);
  });

  it('returns null when only prereleases exist and they are excluded', () => {
    expect(selectRelease([release(1, '2026-01-01T00:00:00Z', true)], false)).toBeNull();
  });

  it('picks the newest prerelease when included', () => {
    const stable = release(1, '2026-01-01T00:00:00Z');
    const rc = release(2, '2026-06-01T00:00:00Z', true);
    expect(selectRelease([stable, rc], true)).toBe(rc);
  });

  it('orders by publishedAt regardless of input order', () => {
    const older = release(9, '2025-12-31T23:59:59Z');
    const newer = release(3, '2026-02-01T08:00:00Z');
    expect(selectRelease([older, newer], false)).toBe(newer);
    expect(selectRelease([newer, older], false)).toBe(newer);
  });

  it('sorts null publishedAt last', () => {
    const undated = release(50, null);
    const dated = release(1, '2020-01-01T00:00:00Z');
    expect(selectRelease([undated, dated], false)).toBe(dated);
    expect(selectRelease([undated], false)).toBe(undated);
  });

  it('breaks a publishedAt tie with the higher id', () => {
    const low = release(10, '2026-03-01T00:00:00Z');
    const high = release(20, '2026-03-01T00:00:00Z');
    expect(selectRelease([high, low], false)).toBe(high);
    expect(selectRelease([low, high], false)).toBe(high);
  });

  it('breaks a null-null tie with the higher id', () => {
    const low = release(10, null);
    const high = release(20, null);
    expect(selectRelease([low, high], false)).toBe(high);
  });
});

describe('prereleaseExists', () => {
  it('detects prereleases', () => {
    expect(prereleaseExists([release(1, null), release(2, null, true)])).toBe(true);
  });

  it('is false without any', () => {
    expect(prereleaseExists([release(1, null)])).toBe(false);
    expect(prereleaseExists([])).toBe(false);
  });
});
