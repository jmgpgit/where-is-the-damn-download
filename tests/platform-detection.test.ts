import { describe, expect, it } from 'vitest';
import type { Architecture, OperatingSystem } from '../src/domain/asset-types';
import { detectArchitectures, detectOperatingSystems } from '../src/domain/platform-detection';
import { tokenize } from '../src/domain/tokenizer';

interface Case {
  name: string;
  os: OperatingSystem[];
  arch: Architecture[];
}

const CASES: Case[] = [
  { name: 'Foo-4.2.1-setup-win64.exe', os: ['windows'], arch: ['x64'] },
  { name: 'Foo_4.2.1_x64.msi', os: ['windows'], arch: ['x64'] },
  { name: 'foo-x86_64-pc-windows-msvc.zip', os: ['windows'], arch: ['x64'] },
  { name: 'foo-aarch64-pc-windows-msvc.zip', os: ['windows'], arch: ['arm64'] },
  { name: 'foo-x86_64-apple-darwin.tar.gz', os: ['macos'], arch: ['x64'] },
  { name: 'foo-aarch64-apple-darwin.tar.gz', os: ['macos'], arch: ['arm64'] },
  { name: 'foo-macos-universal.dmg', os: ['macos'], arch: ['universal'] },
  { name: 'foo-universal2.dmg', os: ['macos'], arch: ['universal'] },
  { name: 'foo-linux-x86_64.AppImage', os: ['linux'], arch: ['x64'] },
  { name: 'foo-linux-aarch64.AppImage', os: ['linux'], arch: ['arm64'] },
  { name: 'foo_amd64.deb', os: ['linux'], arch: ['x64'] },
  { name: 'foo_arm64.deb', os: ['linux'], arch: ['arm64'] },
  { name: 'foo-win32-ia32.zip', os: ['windows'], arch: ['x86'] },
  { name: 'foo-win32-x64.zip', os: ['windows'], arch: ['x64'] },
  { name: 'foo-win32.zip', os: ['windows'], arch: ['x86'] },
  { name: 'foo-win-arm64.exe', os: ['windows'], arch: ['arm64'] },
  { name: 'foo-win-x86.zip', os: ['windows'], arch: ['x86'] },
  { name: 'foo-32-bit-windows.exe', os: ['windows'], arch: ['x86'] },
  { name: 'foo-64-bit-windows.exe', os: ['windows'], arch: ['x64'] },
  { name: 'foo-win-32bit.zip', os: ['windows'], arch: ['x86'] },
  { name: 'foo-win-64bit.zip', os: ['windows'], arch: ['x64'] },
  { name: 'foo-i686-mingw.zip', os: ['windows'], arch: ['x86'] },
  { name: 'foo-linux-armv7.tar.gz', os: ['linux'], arch: ['arm'] },
  { name: 'foo-armhf.deb', os: ['linux'], arch: ['arm'] },
  { name: 'foo-riscv64-linux-musl.tar.gz', os: ['linux'], arch: ['riscv64'] },
  { name: 'foo-noarch.zip', os: [], arch: ['universal'] },
  { name: 'foo-apple-silicon.dmg', os: ['macos'], arch: [] },
  { name: 'foo-ubuntu-22.04-amd64.deb', os: ['linux'], arch: ['x64'] },
  { name: 'foo.flatpakref', os: ['linux'], arch: [] },
  { name: 'foo.exe', os: ['windows'], arch: [] },
  { name: 'foo.zip', os: [], arch: [] },
  { name: 'foo-64.zip', os: [], arch: [] },
  { name: 'foo-win-mac-linux.jar', os: ['windows', 'macos', 'linux'], arch: [] },
];

const sorted = <T extends string>(xs: readonly T[]): T[] => [...xs].sort();

describe('detectOperatingSystems / detectArchitectures', () => {
  it.each(CASES)('$name', ({ name, os, arch }) => {
    const t = tokenize(name);
    expect(sorted(detectOperatingSystems(t).systems)).toEqual(sorted(os));
    expect(sorted(detectArchitectures(t).architectures)).toEqual(sorted(arch));
  });

  it('regression: darwin never reads as windows', () => {
    for (const name of ['foo-x86_64-apple-darwin.tar.gz', 'foo-darwin-arm64.zip', 'darwin.zip']) {
      expect(detectOperatingSystems(tokenize(name)).systems).not.toContain('windows');
    }
  });

  it('distinguishes token evidence from extension evidence', () => {
    expect(detectOperatingSystems(tokenize('foo-setup.exe'))).toEqual({
      systems: ['windows'],
      tokenSystems: [],
      extensionSystem: 'windows',
      nonDesktop: null,
    });
    expect(detectOperatingSystems(tokenize('foo-windows.zip')).tokenSystems).toEqual(['windows']);
  });

  it('win32 is only a weak x86 hint, silenced by any other arch token', () => {
    expect(detectArchitectures(tokenize('foo-win32.zip'))).toEqual({ architectures: ['x86'], weakX86: true, foreign: [] });
    expect(detectArchitectures(tokenize('foo-win32-x64.zip'))).toEqual({ architectures: ['x64'], weakX86: false, foreign: [] });
  });

  it('reports foreign processors and non-desktop systems', () => {
    expect(detectArchitectures(tokenize('foo-s390x-linux.tar.gz')).foreign).toEqual(['s390x']);
    expect(detectArchitectures(tokenize('foo-linux_ppc64le.tar.gz')).foreign).toEqual(['ppc64le']);
    expect(detectOperatingSystems(tokenize('foo-ios-arm64.zip')).nonDesktop).toBe('iOS');
    expect(detectOperatingSystems(tokenize('foo-freebsd_amd64.tar.gz')).systems).toEqual(['openbsd']);
    expect(detectOperatingSystems(tokenize('foo-installer.sh')).systems).toEqual(['macos', 'linux']);
    expect(detectOperatingSystems(tokenize('foo-installer.ps1')).systems).toEqual(['windows']);
  });

  it.each([
    ['foo-macos-12-m1.dmg', 'arm64'],
    ['foo-macos-intel.dmg', 'x64'],
    ['foo-linux-armv7l.zip', 'arm'],
    ['foo-linux-arm32.tar.gz', 'arm'],
    ['foo-arm-unknown-linux-musleabihf.tar.gz', 'arm'],
    ['foo_armv6.deb', 'arm'],
  ])('%s is %s', (name, arch) => {
    expect(detectArchitectures(tokenize(name)).architectures).toEqual([arch]);
  });

  it('bare numeric tokens carry no meaning', () => {
    expect(detectArchitectures(tokenize('foo-64.zip')).architectures).toEqual([]);
    expect(detectArchitectures(tokenize('foo-32.zip')).architectures).toEqual([]);
  });
});
