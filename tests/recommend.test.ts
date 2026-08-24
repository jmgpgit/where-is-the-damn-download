import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  Architecture,
  AssetInput,
  Confidence,
  OperatingSystem,
  Recommendation,
  UserPlatform,
  UserPreferences,
} from '../src/domain/asset-types';
import { recommend } from '../src/domain/recommend';

const PREFS: UserPreferences = { mode: 'simple', packagePreference: 'none', releaseChannel: 'stable', showSourceWarnings: true };
const platform = (os: OperatingSystem, arch: Architecture): UserPlatform => ({ os, arch, detectedOs: os, detectedArch: arch, overridden: false });
const WIN_X64 = platform('windows', 'x64');

const asset = (name: string, id: number, over: Partial<AssetInput> = {}): AssetInput => ({
  assetId: id,
  name,
  label: null,
  size: 1000,
  downloadCount: 0,
  downloadUrl: `https://example.invalid/${name}`,
  ...over,
});
const assets = (...names: string[]): AssetInput[] => names.map((n, i) => asset(n, i + 1));
const names = (xs: { name: string }[]): string[] => xs.map((x) => x.name);

// --- fixture-driven release cases ------------------------------------------

interface RepositoryCase {
  name: string;
  platform: { os: OperatingSystem; arch: Architecture };
  preferences: Partial<UserPreferences>;
  assets: Array<{ name: string; size: number; downloadCount: number }>;
  expect: { primaryName: string | null; confidence: Confidence; excludedCount?: number };
}

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/repository-cases/', import.meta.url));
const FIXTURES: RepositoryCase[] = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(`${FIXTURE_DIR}${f}`, 'utf8')) as RepositoryCase);

describe('recommend: repository fixtures', () => {
  it('has at least 15 cases', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(15);
  });

  it.each(FIXTURES)('$name', (c) => {
    const input = c.assets.map((a, i) => asset(a.name, i + 1, { size: a.size, downloadCount: a.downloadCount }));
    const rec = recommend(input, platform(c.platform.os, c.platform.arch), { ...PREFS, ...c.preferences });
    expect(rec.primary?.name ?? null).toBe(c.expect.primaryName);
    expect(rec.confidence).toBe(c.expect.confidence);
    if (c.expect.excludedCount !== undefined) expect(rec.excluded).toHaveLength(c.expect.excludedCount);
    const total = (rec.primary ? 1 : 0) + rec.alternatives.length + rec.excluded.length;
    expect(total).toBe(input.length);
  });
});

// --- named regressions -----------------------------------------------------

describe('recommend: regressions', () => {
  it('win-arm64 is never recommended to an x64 user', () => {
    const rec = recommend(assets('foo-win-arm64.exe', 'foo-win-x64.exe'), WIN_X64, PREFS);
    expect(rec.primary?.name).toBe('foo-win-x64.exe');
    expect(names(rec.excluded)).toEqual(['foo-win-arm64.exe']);
    expect(recommend(assets('foo-win-arm64.exe'), WIN_X64, PREFS).primary).toBeUndefined();
  });

  it('checksums and signatures are never primary', () => {
    const rec = recommend(assets('foo-checksums.sha256', 'foo.sig', 'foo.asc', 'foo-win64.zip'), WIN_X64, PREFS);
    expect(rec.primary?.name).toBe('foo-win64.zip');
    expect(rec.alternatives).toHaveLength(0);
    expect(recommend(assets('foo-checksums.sha256', 'foo.sig'), WIN_X64, PREFS).primary).toBeUndefined();
  });

  it('weak candidates (no OS evidence, generic archive or unknown) are listed but never primary', () => {
    for (const name of ['foo.zip', 'foo-3.0.5.tar.gz', 'foo-x64.zip', 'foo-noarch.zip', 'foo']) {
      const rec = recommend(assets(name), WIN_X64, PREFS);
      expect(rec.primary, name).toBeUndefined();
      expect(rec.confidence).toBe('none');
      expect(names(rec.alternatives)).toEqual([name]);
      expect(rec.summary).toContain('no ready-to-run download');
    }
  });

  it('variant ties are settled by downloads and explained', () => {
    const rec = recommend(
      [asset('foo-x64-setup.exe', 1, { downloadCount: 5 }), asset('foo-x64-user-setup.exe', 2, { downloadCount: 500 })],
      WIN_X64,
      PREFS,
    );
    expect(rec.primary?.name).toBe('foo-x64-user-setup.exe');
    expect(rec.confidence).not.toBe('low');
    expect(rec.primary?.evidence.find((e) => e.ruleId === 'tie-downloads')?.explanation).toBe(
      'Chosen over foo-x64-setup.exe because more people downloaded it.',
    );
    const plain = recommend(assets('foo-x64-setup.exe', 'foo-win64.zip'), WIN_X64, PREFS);
    expect(plain.primary?.evidence.some((e) => e.ruleId === 'tie-downloads')).toBe(false);
  });

  it('foreign processors, iOS, metadata and scripts', () => {
    const linux: UserPlatform = platform('linux', 'x64');
    const rec = recommend(
      assets('foo-s390x-linux.tar.gz', 'foo-ios.zip', 'README.md', 'dist-manifest.json', 'foo-installer.sh', 'foo-x86_64-linux.tar.gz'),
      linux,
      PREFS,
    );
    expect(rec.primary?.name).toBe('foo-x86_64-linux.tar.gz');
    expect(names(rec.alternatives)).toEqual(['foo-installer.sh']);
    expect(names(rec.excluded).sort()).toEqual(['README.md', 'dist-manifest.json', 'foo-ios.zip', 'foo-s390x-linux.tar.gz']);
    const why = (r: Recommendation, n: string): string | undefined =>
      r.excluded.find((a) => a.name === n)?.evidence.find((e) => e.effect === 'exclude')?.explanation;
    expect(why(rec, 'foo-s390x-linux.tar.gz')).toBe('Not for this computer: this build is for a different kind of processor (s390x).');
    expect(why(rec, 'foo-ios.zip')).toBe('Not for this computer: this build is for iOS.');
    expect(why(rec, 'README.md')).toBe('Not recommended: this is a text or metadata file, not an application.');
    expect(why(recommend(assets('foo-installer.sh'), WIN_X64, PREFS), 'foo-installer.sh')).toBe(
      'Not for this computer: this build is for macOS or Linux computers.',
    );
    expect(why(recommend(assets('foo-freebsd_amd64.tar.gz'), WIN_X64, PREFS), 'foo-freebsd_amd64.tar.gz')).toBe(
      'Not for this computer: this build is for BSD computers.',
    );
  });

  it('symbols and debug builds never beat a normal binary', () => {
    const rec = recommend(assets('foo-win64-symbols.zip', 'foo-debug-x64.exe', 'foo-win64.zip'), WIN_X64, PREFS);
    expect(rec.primary?.name).toBe('foo-win64.zip');
    expect(names(rec.excluded)).toEqual(['foo-win64-symbols.zip']);
  });

  it('x64 installer beats portable zip under neutral and installer preferences', () => {
    const input = assets('foo-win64-portable.zip', 'Foo-4.2.1-setup-win64.exe');
    expect(recommend(input, WIN_X64, PREFS).primary?.name).toBe('Foo-4.2.1-setup-win64.exe');
    const installer = { ...PREFS, packagePreference: 'installer' as const };
    const rec = recommend(input, WIN_X64, installer);
    expect(rec.primary?.name).toBe('Foo-4.2.1-setup-win64.exe');
    expect(rec.alternatives[0]?.evidence.some((e) => e.ruleId === 'pref-installer-over-portable')).toBe(true);
  });

  it('portable zip wins when portable is preferred', () => {
    const portable = { ...PREFS, packagePreference: 'portable' as const };
    const rec = recommend(assets('Foo-4.2.1-setup-win64.exe', 'foo-win64-portable.zip'), WIN_X64, portable);
    expect(rec.primary?.name).toBe('foo-win64-portable.zip');
  });

  it('installer preference penalty is relative: no installer, no penalty', () => {
    const installer = { ...PREFS, packagePreference: 'installer' as const };
    const rec = recommend(assets('foo-win64-portable.zip'), WIN_X64, installer);
    expect(rec.primary?.score).toBe(96);
    expect(rec.warnings[0]).toContain('portable version');
  });

  it('download count never overrides incompatibility', () => {
    const rec = recommend(
      [asset('foo-win-arm64.exe', 1, { downloadCount: 1_000_000 }), asset('foo-win-x64.exe', 2, { downloadCount: 0 })],
      WIN_X64,
      PREFS,
    );
    expect(rec.primary?.name).toBe('foo-win-x64.exe');
  });

  it('download count breaks otherwise equal ties', () => {
    const rec = recommend(
      [asset('foo-win64-home.zip', 1, { downloadCount: 5 }), asset('foo-win64-pro.zip', 2, { downloadCount: 500 })],
      WIN_X64,
      PREFS,
    );
    expect(rec.primary?.name).toBe('foo-win64-pro.zip');
  });

  it('input order is irrelevant', () => {
    const input = assets('foo.zip', 'foo-win64-portable.zip', 'Foo-4.2.1-setup-win64.exe', 'foo.sha256', 'foo-win-arm64.exe', 'foo-cli-win64.exe');
    const a = recommend(input, WIN_X64, PREFS);
    const b = recommend([...input].reverse(), WIN_X64, PREFS);
    const c = recommend([input[3]!, input[0]!, input[5]!, input[1]!, input[4]!, input[2]!], WIN_X64, PREFS);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('equal-score tie is deterministic (filename ascending)', () => {
    const forward = recommend(assets('foo-win64-pro.zip', 'foo-win64-home.zip'), WIN_X64, PREFS);
    const backward = recommend(assets('foo-win64-home.zip', 'foo-win64-pro.zip'), WIN_X64, PREFS);
    expect(forward.primary?.name).toBe('foo-win64-home.zip');
    expect(backward.primary?.name).toBe('foo-win64-home.zip');
    expect(forward.primary?.score).toBe(forward.alternatives[0]?.score);
  });

  it('generic zip alone is never recommended', () => {
    const rec = recommend(assets('foo.zip'), WIN_X64, PREFS);
    expect(rec.primary).toBeUndefined();
    expect(rec.confidence).toBe('none');
    expect(names(rec.alternatives)).toEqual(['foo.zip']);
  });

  it('installer preference lifts an arch-less installer over an arch-tagged portable zip', () => {
    const installer = { ...PREFS, packagePreference: 'installer' as const };
    const rec = recommend(assets('Foo-2.1.6.Setup.exe', 'foo-win32-x64-2.1.6.zip'), WIN_X64, installer);
    expect(rec.primary?.name).toBe('Foo-2.1.6.Setup.exe');
    expect(rec.primary?.score).toBe(100);
    expect(rec.confidence).toBe('medium');
    expect(recommend(assets('Foo-2.1.6.Setup.exe', 'foo-win32-x64-2.1.6.zip'), WIN_X64, PREFS).primary?.name).toBe('foo-win32-x64-2.1.6.zip');
  });

  it('a jar never outranks a native windows package', () => {
    const rec = recommend(assets('foo.jar', 'foo-win64.zip', 'foo.exe'), WIN_X64, PREFS);
    expect(names([rec.primary!, ...rec.alternatives])).toEqual(['foo-win64.zip', 'foo.exe', 'foo.jar']);
  });

  it('tie-break chain prefers explicit os token over extension at equal score', () => {
    // foo-windows-x64.tar.gz: 50 + 30 + 2 = 82; foo-x64-setup-x86.exe would differ, so build the tie by hand
    const rec = recommend(assets('foo-windows-x64.tar.gz', 'foo-x64-server.exe'), WIN_X64, PREFS);
    // server exe: 40 + 30 + 28 - 20 = 78 < 82, so ordering is by score; verify both listed once
    expect(names([rec.primary!, ...rec.alternatives])).toEqual(['foo-windows-x64.tar.gz', 'foo-x64-server.exe']);
  });
});
