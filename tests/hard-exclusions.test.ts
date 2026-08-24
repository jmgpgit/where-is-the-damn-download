import { describe, expect, it } from 'vitest';
import type { AssetInput, UserPlatform, UserPreferences } from '../src/domain/asset-types';
import { recommend } from '../src/domain/recommend';
import { isValidSettingsPatch, parseBackgroundRequest } from '../src/shared/messages';

const prefs: UserPreferences = {
  mode: 'simple',
  packagePreference: 'installer',
  releaseChannel: 'stable',
  showSourceWarnings: true,
};

function platform(os: UserPlatform['os'], arch: UserPlatform['arch']): UserPlatform {
  return { os, arch, detectedOs: os, detectedArch: arch, overridden: false };
}

function assets(...names: string[]): AssetInput[] {
  return names.map((name, i) => ({
    assetId: i + 1,
    name,
    size: 1000,
    downloadCount: 0,
    downloadUrl: `https://github.com/o/r/releases/download/v1/${name}`,
  }));
}

/** Real-world side files that must never be offered, on any platform. */
const SIDE_FILES = [
  'SHA256SUMS',
  'SHASUMS256.txt',
  'sha256sum.txt',
  'md5sums',
  'app.tar.gz.sha1',
  'app-win64.zip.sha256sum',
  'app-win64.pdb',
  'app-linux-x64.tar.gz.pem',
  'app-linux-x64.tar.gz.sigstore.json',
  'RELEASES',
];

describe('hard exclusions for common side files', () => {
  for (const name of SIDE_FILES) {
    it(`${name} is excluded even when it is the only compatible-looking file`, () => {
      for (const p of [
        platform('windows', 'x64'),
        platform('linux', 'x64'),
        platform('macos', 'arm64'),
      ]) {
        const rec = recommend(assets('app-windows-x64.exe', name), p, prefs);
        expect(rec.primary?.name, `${name} on ${p.os}`).not.toBe(name);
        expect(rec.alternatives.map((a) => a.name)).not.toContain(name);
        const excluded = rec.excluded.find((a) => a.name === name);
        expect(excluded?.evidence.some((e) => e.effect === 'exclude')).toBe(true);
      }
    });
  }

  it('pushes package-manager payloads below real installers', () => {
    const rec = recommend(
      assets('app-1.0.0-setup.exe', 'app-1.0.0-full.nupkg'),
      platform('windows', 'x64'),
      prefs
    );
    expect(rec.primary?.name).toBe('app-1.0.0-setup.exe');
    const nupkg = [...rec.alternatives, ...rec.excluded].find((a) => a.name.endsWith('.nupkg'));
    expect(nupkg?.roles).toContain('sdk');
  });
});

describe('save-settings patch validation', () => {
  it('accepts partial patches with valid fields only', () => {
    expect(isValidSettingsPatch({ mode: 'advanced' })).toBe(true);
    expect(isValidSettingsPatch({})).toBe(true);
    expect(isValidSettingsPatch({ mode: 'weird' })).toBe(false);
    expect(isValidSettingsPatch({ unknown: true })).toBe(false);
    expect(isValidSettingsPatch({ toString: true })).toBe(false);
  });

  it('parses get-state only with a surface, and save-settings only with a patch', () => {
    const base = { type: 'get-state', owner: 'o', repo: 'r', selector: { kind: 'latest' } };
    expect(parseBackgroundRequest(base)).toBeNull();
    expect(parseBackgroundRequest({ ...base, surface: 'home' })).toMatchObject({ surface: 'home' });
    expect(parseBackgroundRequest({ type: 'save-settings', patch: { enabled: false } })).toEqual({
      type: 'save-settings',
      patch: { enabled: false },
    });
    expect(parseBackgroundRequest({ type: 'save-settings', settings: {} })).toBeNull();
  });
});
