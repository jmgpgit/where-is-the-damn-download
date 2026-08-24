import { describe, expect, it } from 'vitest';
import type { AssetInput, UserPlatform, UserPreferences } from '../src/domain/asset-types';
import { explainExclusion, explainPrimary } from '../src/domain/explanations';
import { recommend } from '../src/domain/recommend';
import { classifyAsset } from '../src/domain/scoring';

const PREFS: UserPreferences = { mode: 'simple', packagePreference: 'none', releaseChannel: 'stable', showSourceWarnings: true };
const WIN_X64: UserPlatform = { os: 'windows', arch: 'x64', detectedOs: 'windows', detectedArch: 'x64', overridden: false };
const MAC_ARM: UserPlatform = { os: 'macos', arch: 'arm64', detectedOs: 'macos', detectedArch: 'arm64', overridden: false };
const LINUX_X64: UserPlatform = { os: 'linux', arch: 'x64', detectedOs: 'linux', detectedArch: 'x64', overridden: false };

const asset = (name: string, id: number, over: Partial<AssetInput> = {}): AssetInput => ({
  assetId: id,
  name,
  label: null,
  size: 1000,
  downloadCount: 0,
  downloadUrl: `https://example.invalid/${name}`,
  ...over,
});

const ROSTER = [
  'Foo-4.2.1-setup-win64.exe', 'Foo_4.2.1_x64.msi', 'foo-x86_64-pc-windows-msvc.zip', 'foo-aarch64-pc-windows-msvc.zip',
  'foo-x86_64-apple-darwin.tar.gz', 'foo-aarch64-apple-darwin.tar.gz', 'foo-macos-universal.dmg', 'foo-linux-x86_64.AppImage',
  'foo-linux-aarch64.AppImage', 'foo_amd64.deb', 'foo_arm64.deb', 'foo-win64-portable.zip', 'foo-windows-standalone.exe',
  'foo-win32-ia32.zip', 'foo-win32-x64.zip', 'foo-win-arm64.exe', 'foo-win64-symbols.zip', 'foo-debug-x64.exe',
  'foo-sdk-windows-x64.zip', 'foo-server-windows-amd64.zip', 'foo-cli-windows-amd64.exe', 'foo-checksums.sha256', 'foo.sha512',
  'foo.sig', 'foo.asc', 'foo.sbom.spdx.json', 'foo.cdx.json', 'foo.pdb.zip', 'foo.dSYM.zip', 'foo.blockmap', 'latest.yml',
  'update.yaml', 'foo-source-code.zip', 'foo-src.tar.gz', 'foo.jar', 'foo.zip', 'foo.exe',
];

const HARD_EXCLUDED = new Set([
  'foo-win64-symbols.zip', 'foo-checksums.sha256', 'foo.sha512', 'foo.sig', 'foo.asc', 'foo.sbom.spdx.json', 'foo.cdx.json',
  'foo.pdb.zip', 'foo.dSYM.zip', 'foo.blockmap', 'latest.yml', 'update.yaml', 'foo-source-code.zip', 'foo-src.tar.gz',
]);

const rosterAssets = (downloads: (name: string) => number = () => 0): AssetInput[] =>
  ROSTER.map((n, i) => asset(n, i + 1, { downloadCount: downloads(n) }));

const PLATFORMS = [WIN_X64, MAC_ARM, LINUX_X64];

describe('invariants', () => {
  it('every input asset lands in exactly one bucket', () => {
    for (const platform of PLATFORMS) {
      const rec = recommend(rosterAssets(), platform, PREFS);
      const ids = [rec.primary, ...rec.alternatives, ...rec.excluded]
        .filter((a): a is NonNullable<typeof a> => a !== undefined)
        .map((a) => a.assetId);
      expect(ids.length).toBe(ROSTER.length);
      expect(new Set(ids).size).toBe(ROSTER.length);
    }
  });

  it('adding an incompatible-OS token never raises a score', () => {
    const bases = ['foo-x64.zip', 'foo-setup.exe', 'foo.zip', 'foo-win64.exe', 'foo-win-x64.zip', 'foo.jar'];
    for (const base of bases) {
      const before = classifyAsset(asset(base, 1), WIN_X64, PREFS);
      const after = classifyAsset(asset(base.replace('foo', 'foo-linux'), 1), WIN_X64, PREFS);
      expect(!after.eligible || after.score <= before.score).toBe(true);
    }
  });

  it('hard-excluded assets are never primary or alternatives', () => {
    for (const platform of PLATFORMS) {
      const rec = recommend(rosterAssets(), platform, PREFS);
      const listed = [rec.primary, ...rec.alternatives].filter((a) => a !== undefined).map((a) => a.name);
      for (const name of listed) expect(HARD_EXCLUDED.has(name)).toBe(false);
      for (const name of HARD_EXCLUDED) expect(rec.excluded.map((a) => a.name)).toContain(name);
    }
  });

  it('popularity never makes an ineligible asset primary', () => {
    for (const platform of PLATFORMS) {
      const rec = recommend(rosterAssets((n) => (HARD_EXCLUDED.has(n) || n.includes('arm64') ? 1_000_000_000 : 0)), platform, PREFS);
      expect(rec.primary?.eligible).toBe(true);
      expect(rec.primary?.score).toBeGreaterThan(0);
      expect(rec.primary?.downloadCount).toBe(0);
    }
  });

  it('is deterministic across repeated and shuffled runs', () => {
    const input = rosterAssets((n) => n.length * 7);
    const shuffled = [...input.filter((_, i) => i % 3 === 1), ...input.filter((_, i) => i % 3 === 0).reverse(), ...input.filter((_, i) => i % 3 === 2)];
    for (const platform of PLATFORMS) {
      const a = recommend(input, platform, PREFS);
      expect(recommend(input, platform, PREFS)).toEqual(a);
      expect(recommend(shuffled, platform, PREFS)).toEqual(a);
    }
  });

  it('every primary has a positive explanation', () => {
    for (const platform of PLATFORMS) {
      const rec = recommend(rosterAssets(), platform, PREFS);
      expect(rec.primary).toBeDefined();
      expect(rec.primary?.evidence.some((e) => e.effect === 'positive')).toBe(true);
      expect(explainPrimary(rec.primary!)).toMatch(/^Recommended because it .+\.$/);
    }
  });

  it('every excluded asset has an exclusion explanation', () => {
    for (const platform of PLATFORMS) {
      for (const ex of recommend(rosterAssets(), platform, PREFS).excluded) {
        expect(ex.evidence.filter((e) => e.effect === 'exclude')).toHaveLength(1);
        expect(explainExclusion(ex)).toMatch(/^Not .+\.$/);
      }
    }
  });
});
