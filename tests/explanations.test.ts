import { describe, expect, it } from 'vitest';
import type { AssetInput, UserPlatform, UserPreferences } from '../src/domain/asset-types';
import { buildSummary, buildWarnings, explainCaveats, explainExclusion, explainPrimary } from '../src/domain/explanations';
import { recommend } from '../src/domain/recommend';
import { classifyAsset } from '../src/domain/scoring';

const WIN_X64: UserPlatform = { os: 'windows', arch: 'x64', detectedOs: 'windows', detectedArch: 'x64', overridden: false };
const PREFS: UserPreferences = { mode: 'simple', packagePreference: 'none', releaseChannel: 'stable', showSourceWarnings: true };

const asset = (name: string, id = 1): AssetInput => ({ assetId: id, name, label: null, size: 1000, downloadCount: 0, downloadUrl: `https://example.invalid/${name}` });
const classify = (name: string, prefs = PREFS, platform = WIN_X64) => classifyAsset(asset(name), platform, prefs);

describe('explainPrimary', () => {
  it('composes the canonical sentence', () => {
    expect(explainPrimary(classify('Foo-4.2.1-setup-win64.exe'))).toBe(
      'Recommended because it is marked for Windows, matches your 64-bit computer, and is a standard installer.',
    );
  });

  it.each([
    ['Foo_4.2.1_x64.msi', 'has a file type made for Windows'],
    ['foo-macos-universal.dmg', 'runs on any processor'],
    ['foo.zip', 'does not name an operating system'],
    ['foo.jar', 'works on any operating system'],
    ['foo-win32-ia32.zip', 'is a 32-bit build on a 64-bit computer'],
  ])('%s mentions "%s"', (name, fragment) => {
    const platform: UserPlatform = name.endsWith('.dmg') ? { ...WIN_X64, os: 'macos', detectedOs: 'macos' } : WIN_X64;
    expect(explainPrimary(classify(name, PREFS, platform))).toContain(fragment);
  });

  it('always yields a positive sentence for an eligible asset', () => {
    for (const name of ['foo.zip', 'foo.exe', 'foo-sdk-windows-x64.zip', 'foo.tgz']) {
      expect(explainPrimary(classify(name))).toMatch(/^Recommended because it .+\.$/);
    }
  });
});

describe('explainExclusion', () => {
  it.each([
    ['foo-checksums.sha256', 'Not recommended: this is a checksum file used to verify another download.'],
    ['foo.sig', 'Not recommended: this is a digital signature used to verify another download.'],
    ['foo-src.tar.gz', 'Not recommended: this is the source code, not a ready-to-run program.'],
    ['foo.cdx.json', 'Not recommended: this file describes the software for auditors; it is not the program.'],
    ['foo.dSYM.zip', 'Not recommended: this contains debugging symbols for developers, not the program.'],
    ['latest.yml', "Not recommended: this file is used by the app's automatic updater."],
    ['foo-win-arm64.exe', 'Not for this computer: this build is for Windows on ARM 64-bit processors.'],
    ['foo-macos-universal.dmg', 'Not for this computer: this build is for macOS computers.'],
  ])('%s', (name, sentence) => {
    expect(explainExclusion(classify(name))).toBe(sentence);
  });

  it('explains an empty file', () => {
    const r = classifyAsset({ ...asset('foo-win64.zip'), size: 0 }, WIN_X64, PREFS);
    expect(explainExclusion(r)).toBe('Not recommended: this file is empty.');
  });
});

describe('explainCaveats', () => {
  it('lists penalties and informational notes', () => {
    expect(explainCaveats(classify('foo-debug-cli-win64.exe'))).toEqual([
      'Command-line application — opens in a terminal',
      'It is a debug build meant for developers.',
    ]);
    expect(explainCaveats(classify('Foo-4.2.1-setup-win64.exe'))).toEqual([]);
  });
});

describe('buildWarnings', () => {
  it('warns about 32-bit, java, cli, and portable-over-installer', () => {
    expect(buildWarnings(classify('foo-win32-ia32.zip'), PREFS)[0]).toContain('32-bit build on a 64-bit computer');
    expect(buildWarnings(classify('foo.jar'), PREFS)).toEqual(['This program needs Java installed to run.']);
    expect(buildWarnings(classify('foo-cli-win64.exe'), PREFS)).toEqual(['Command-line application — opens in a terminal.']);
    const installer = { ...PREFS, packagePreference: 'installer' as const };
    expect(buildWarnings(classify('foo-win64.zip', installer), installer)[0]).toContain('portable version, not an installer');
    expect(buildWarnings(classify('foo-win64.zip'), PREFS)).toEqual([]);
    expect(buildWarnings(undefined, PREFS)).toEqual([]);
  });
});

describe('buildSummary and recommend wiring', () => {
  it('phrases each state for beginners', () => {
    expect(buildSummary('none', undefined)).toBe('This release has no ready-to-run download for your computer.');
    const primary = classify('Foo-4.2.1-setup-win64.exe');
    expect(buildSummary('high', primary)).toBe('Foo-4.2.1-setup-win64.exe looks like the right download for your computer.');
    expect(buildSummary('medium', primary)).toContain('is probably the right download');
    expect(buildSummary('low', primary)).toContain('our best guess');
  });

  it('recommend() carries summary and warnings', () => {
    const rec = recommend([asset('foo-win32-ia32.zip'), asset('foo.sha256', 2)], WIN_X64, PREFS);
    expect(rec.summary).toContain('foo-win32-ia32.zip');
    expect(rec.warnings).toHaveLength(1);
    expect(recommend([], WIN_X64, PREFS).summary).toContain('no ready-to-run download');
  });
});
