import { describe, expect, it } from 'vitest';
import type {
  Architecture,
  AssetInput,
  OperatingSystem,
  PackageKind,
  UserPlatform,
  UserPreferences,
} from '../src/domain/asset-types';
import { classifyAsset } from '../src/domain/scoring';

const WIN_X64: UserPlatform = { os: 'windows', arch: 'x64', detectedOs: 'windows', detectedArch: 'x64', overridden: false };
const PREFS: UserPreferences = { mode: 'simple', packagePreference: 'none', releaseChannel: 'stable', showSourceWarnings: true };

const asset = (name: string, over: Partial<AssetInput> = {}): AssetInput => ({
  assetId: 1,
  name,
  label: null,
  size: 1000,
  downloadCount: 0,
  downloadUrl: `https://example.invalid/${name}`,
  ...over,
});

interface Case {
  name: string;
  size?: number;
  eligible: boolean;
  os?: OperatingSystem[];
  arch?: Architecture[];
  kind?: PackageKind;
  roles?: string[];
  score?: number;
  rule?: string;
}

// Classification for a Windows x64 user, neutral package preference.
const CASES: Case[] = [
  { name: 'Foo-4.2.1-setup-win64.exe', eligible: true, os: ['windows'], arch: ['x64'], kind: 'windows-installer', score: 114 },
  { name: 'Foo_4.2.1_x64.msi', eligible: true, os: ['windows'], arch: ['x64'], kind: 'windows-installer', score: 105, rule: 'os-extension' },
  { name: 'foo-x86_64-pc-windows-msvc.zip', eligible: true, os: ['windows'], arch: ['x64'], kind: 'portable-archive', score: 96 },
  { name: 'foo-aarch64-pc-windows-msvc.zip', eligible: false, os: ['windows'], arch: ['arm64'], rule: 'arch-incompatible' },
  { name: 'foo-x86_64-apple-darwin.tar.gz', eligible: false, os: ['macos'], arch: ['x64'], rule: 'os-incompatible' },
  { name: 'foo-aarch64-apple-darwin.tar.gz', eligible: false, os: ['macos'], arch: ['arm64'] },
  { name: 'foo-macos-universal.dmg', eligible: false, os: ['macos'], arch: ['universal'], kind: 'macos-installer' },
  { name: 'foo-linux-x86_64.AppImage', eligible: false, os: ['linux'], arch: ['x64'], kind: 'linux-appimage' },
  { name: 'foo-linux-aarch64.AppImage', eligible: false, os: ['linux'], arch: ['arm64'] },
  { name: 'foo_amd64.deb', eligible: false, os: ['linux'], arch: ['x64'], kind: 'linux-deb' },
  { name: 'foo_arm64.deb', eligible: false, os: ['linux'], arch: ['arm64'] },
  { name: 'foo-win64-portable.zip', eligible: true, os: ['windows'], arch: ['x64'], kind: 'portable-archive', roles: ['portable'], score: 96 },
  { name: 'foo-windows-standalone.exe', eligible: true, os: ['windows'], arch: [], kind: 'windows-executable', roles: ['portable'], score: 86 },
  { name: 'foo-win32-ia32.zip', eligible: true, os: ['windows'], arch: ['x86'], kind: 'portable-archive', score: 69, rule: 'arch-32-on-64' },
  { name: 'foo-win32-x64.zip', eligible: true, os: ['windows'], arch: ['x64'], kind: 'portable-archive', score: 96 },
  { name: 'foo-win-arm64.exe', eligible: false, os: ['windows'], arch: ['arm64'], rule: 'arch-incompatible' },
  { name: 'foo-win64-symbols.zip', eligible: false, kind: 'symbols', roles: ['symbols'] },
  { name: 'foo-debug-x64.exe', eligible: true, kind: 'windows-executable', roles: ['debug'], score: 48, rule: 'role-debug' },
  { name: 'foo-sdk-windows-x64.zip', eligible: true, kind: 'portable-archive', roles: ['sdk'], score: 26, rule: 'role-sdk' },
  { name: 'foo-server-windows-amd64.zip', eligible: true, roles: ['server'], score: 76, rule: 'role-server' },
  { name: 'foo-cli-windows-amd64.exe', eligible: true, kind: 'windows-executable', roles: ['cli'], score: 108, rule: 'role-cli' },
  { name: 'foo-checksums.sha256', eligible: false, kind: 'checksum', roles: ['checksum'] },
  { name: 'foo.sha512', eligible: false, kind: 'checksum' },
  { name: 'foo.sig', eligible: false, kind: 'signature' },
  { name: 'foo.asc', eligible: false, kind: 'signature' },
  { name: 'foo.sbom.spdx.json', eligible: false, roles: ['sbom'] },
  { name: 'foo.cdx.json', eligible: false, roles: ['sbom'] },
  { name: 'foo.pdb.zip', eligible: false, kind: 'symbols' },
  { name: 'foo.dSYM.zip', eligible: false, kind: 'symbols' },
  { name: 'foo.blockmap', eligible: false, kind: 'updater-metadata' },
  { name: 'latest.yml', eligible: false, kind: 'updater-metadata' },
  { name: 'update.yaml', eligible: false, kind: 'updater-metadata' },
  { name: 'foo-source-code.zip', eligible: false, kind: 'source' },
  { name: 'foo-src.tar.gz', eligible: false, kind: 'source' },
  { name: 'foo.jar', eligible: true, os: [], kind: 'java-archive', score: 27, rule: 'java-runtime' },
  { name: 'foo.zip', eligible: true, os: [], arch: [], kind: 'generic-archive', score: 21 },
  { name: 'foo.exe', eligible: true, os: ['windows'], arch: [], kind: 'windows-executable', score: 76, rule: 'os-extension' },
  { name: 'foo-msvc-x64.7z', eligible: true, os: ['windows'], kind: 'portable-archive', score: 92 },
  { name: 'foo-universal2.dmg', eligible: false, os: ['macos'], arch: ['universal'] },
  { name: 'foo-noarch.zip', eligible: true, os: [], arch: ['universal'], score: 45, rule: 'os-neutral' },
  { name: 'foo-nightly-win64.exe', eligible: true, roles: ['nightly'], score: 63, rule: 'role-nightly' },
  { name: 'foo-canary-setup.exe', eligible: true, roles: ['nightly'], kind: 'windows-installer', score: 37 },
  { name: 'foo-headless-windows-x64.zip', eligible: true, roles: ['server'], score: 76 },
  { name: 'foo-plugin-windows.zip', eligible: true, roles: ['plugin'], score: 54, rule: 'role-plugin' },
  { name: 'foo-extension-win64.zip', eligible: true, roles: ['plugin'], score: 76 },
  { name: 'foo-resources.zip', eligible: true, kind: 'generic-archive', roles: [], score: 21 },
  { name: 'foo-win-x86.zip', eligible: true, arch: ['x86'], score: 69, rule: 'arch-32-on-64' },
  { name: 'foo-installer-win32.exe', eligible: true, arch: ['x86'], kind: 'windows-installer', score: 87 },
  { name: 'foo-linux-armv7.AppImage', eligible: false, os: ['linux'], arch: ['arm'] },
  { name: 'foo-riscv64-linux.tar.gz', eligible: false, arch: ['riscv64'] },
  { name: 'foo-windows-riscv64.zip', eligible: false, os: ['windows'], arch: ['riscv64'], rule: 'arch-incompatible' },
  { name: 'foo-32-bit-windows.exe', eligible: true, arch: ['x86'], score: 81 },
  { name: 'foo-64-bit-windows.exe', eligible: true, arch: ['x64'], score: 108 },
  { name: 'foo-win-32bit.zip', eligible: true, arch: ['x86'], score: 69 },
  { name: 'foo-win-64bit.zip', eligible: true, arch: ['x64'], score: 96 },
  { name: 'foo-i686-mingw.zip', eligible: true, os: ['windows'], arch: ['x86'], score: 69 },
  { name: 'foo-darwin-arm64.tar.gz', eligible: false, os: ['macos'], arch: ['arm64'] },
  { name: 'foo-ubuntu-22.04-amd64.deb', eligible: false, os: ['linux'] },
  { name: 'foo.appxbundle', eligible: true, kind: 'windows-installer', score: 80 },
  { name: 'foo-setup.msix', eligible: true, kind: 'windows-installer', score: 80 },
  { name: 'foo.flatpakref', eligible: false, os: ['linux'] },
  { name: 'foo.snap', eligible: false, os: ['linux'] },
  { name: 'foo-win64.zip', size: 0, eligible: false, roles: ['empty'], rule: 'role-empty' },
  { name: 'foo.tar.gz', eligible: true, kind: 'generic-archive', score: 21 },
  { name: 'foo-win64.tar.gz', eligible: true, kind: 'portable-archive', score: 82 },
  { name: 'foo-win-mac-linux.jar', eligible: true, os: ['windows', 'macos', 'linux'], kind: 'java-archive', score: 62 },
  { name: 'foo-windows-amd64.exe', eligible: true, score: 108 },
];

const sorted = <T extends string>(xs: readonly T[]): T[] => [...xs].sort();

describe('classifyAsset (windows x64, neutral preference)', () => {
  it(`covers ${CASES.length} assets`, () => {
    expect(CASES.length).toBeGreaterThanOrEqual(60);
  });

  it.each(CASES)('$name', (c) => {
    const r = classifyAsset(asset(c.name, c.size === undefined ? {} : { size: c.size }), WIN_X64, PREFS);
    expect(r.eligible).toBe(c.eligible);
    if (c.os) expect(sorted(r.detectedOperatingSystems)).toEqual(sorted(c.os));
    if (c.arch) expect(sorted(r.detectedArchitectures)).toEqual(sorted(c.arch));
    if (c.kind) expect(r.packageKind).toBe(c.kind);
    if (c.roles) expect(r.roles).toEqual(c.roles);
    if (c.score !== undefined) expect(r.score).toBe(c.score);
    if (c.rule) expect(r.evidence.map((e) => e.ruleId)).toContain(c.rule);
    if (!c.eligible) expect(r.evidence.some((e) => e.effect === 'exclude')).toBe(true);
  });

  it('cli is labelled, never penalized', () => {
    const cli = classifyAsset(asset('foo-cli-windows-amd64.exe'), WIN_X64, PREFS);
    const gui = classifyAsset(asset('foo-windows-amd64.exe'), WIN_X64, PREFS);
    expect(cli.score).toBe(gui.score);
    expect(cli.evidence.find((e) => e.ruleId === 'role-cli')?.explanation).toBe(
      'Command-line application — opens in a terminal',
    );
  });

  it('32-bit on 64-bit windows carries a warning clause', () => {
    const r = classifyAsset(asset('foo-win32-ia32.zip'), WIN_X64, PREFS);
    expect(r.evidence.find((e) => e.ruleId === 'arch-32-on-64')?.explanation).toContain('32-bit build on a 64-bit computer');
  });

  it('download count never enters the score', () => {
    const cold = classifyAsset(asset('foo-win64.zip', { downloadCount: 0 }), WIN_X64, PREFS);
    const hot = classifyAsset(asset('foo-win64.zip', { downloadCount: 10_000_000 }), WIN_X64, PREFS);
    expect(hot.score).toBe(cold.score);
    expect(hot.evidence.some((e) => e.category === 'popularity')).toBe(false);
  });
});

describe('classifyAsset preferences and platforms', () => {
  it('portable preference rewards portable words; other preferences do not', () => {
    const portable = { ...PREFS, packagePreference: 'portable' as const };
    const installer = { ...PREFS, packagePreference: 'installer' as const };
    expect(classifyAsset(asset('foo-win64-portable.zip'), WIN_X64, portable).score).toBe(116);
    expect(classifyAsset(asset('foo-win64-portable.zip'), WIN_X64, installer).score).toBe(96);
    expect(classifyAsset(asset('foo-win64-portable.zip'), WIN_X64, PREFS).score).toBe(96);
  });

  it('nightly penalty is lifted on the prerelease channel', () => {
    const pre = { ...PREFS, releaseChannel: 'include-prerelease' as const };
    expect(classifyAsset(asset('foo-nightly-win64.exe'), WIN_X64, pre).score).toBe(108);
  });

  it('x86 on non-windows x64 is excluded; x64 on arm64 is excluded', () => {
    const linux: UserPlatform = { ...WIN_X64, os: 'linux', detectedOs: 'linux' };
    expect(classifyAsset(asset('foo-linux-i686.tar.gz'), linux, PREFS).eligible).toBe(false);
    const winArm: UserPlatform = { ...WIN_X64, arch: 'arm64', detectedArch: 'arm64' };
    expect(classifyAsset(asset('foo-win-x64.exe'), winArm, PREFS).eligible).toBe(false);
    expect(classifyAsset(asset('foo-win-arm64.exe'), winArm, PREFS).score).toBe(108);
  });

  it('unknown user platform never excludes on os/arch', () => {
    const unknown: UserPlatform = { os: 'unknown', arch: 'unknown', detectedOs: 'unknown', detectedArch: 'unknown', overridden: false };
    for (const name of ['foo-win-arm64.exe', 'foo-macos-universal.dmg', 'foo-linux-x86_64.AppImage']) {
      expect(classifyAsset(asset(name), unknown, PREFS).eligible).toBe(true);
    }
  });

  it('multi-OS asset stays eligible when the target is among them', () => {
    const r = classifyAsset(asset('foo-win-linux-x64.zip'), WIN_X64, PREFS);
    expect(r.eligible).toBe(true);
    expect(r.score).toBe(96);
  });
});
