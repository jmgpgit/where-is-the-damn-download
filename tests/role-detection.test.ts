import { describe, expect, it } from 'vitest';
import type { PackageKind } from '../src/domain/asset-types';
import { detectOperatingSystems } from '../src/domain/platform-detection';
import { describePackage, detectPackageKind, detectRoles } from '../src/domain/role-detection';
import { tokenize } from '../src/domain/tokenizer';

interface RoleCase {
  name: string;
  size?: number;
  hardRole: string | null;
  roles: string[];
}

const ROLE_CASES: RoleCase[] = [
  { name: 'foo-checksums.sha256', hardRole: 'checksum', roles: ['checksum'] },
  { name: 'foo.sha512', hardRole: 'checksum', roles: ['checksum'] },
  { name: 'foo-md5sums.md5', hardRole: 'checksum', roles: ['checksum'] },
  { name: 'foo.sig', hardRole: 'signature', roles: ['signature'] },
  { name: 'foo.asc', hardRole: 'signature', roles: ['signature'] },
  { name: 'foo-win64.exe.minisig', hardRole: 'signature', roles: ['signature'] },
  { name: 'foo.sbom.spdx.json', hardRole: 'sbom', roles: ['sbom'] },
  { name: 'foo.cdx.json', hardRole: 'sbom', roles: ['sbom'] },
  { name: 'foo-provenance.intoto.jsonl', hardRole: 'sbom', roles: ['sbom'] },
  { name: 'foo.pdb.zip', hardRole: 'symbols', roles: ['symbols'] },
  { name: 'foo.dSYM.zip', hardRole: 'symbols', roles: ['symbols'] },
  { name: 'foo-win64-symbols.zip', hardRole: 'symbols', roles: ['symbols'] },
  { name: 'foo.blockmap', hardRole: 'updater-metadata', roles: ['updater-metadata'] },
  { name: 'latest.yml', hardRole: 'updater-metadata', roles: ['updater-metadata'] },
  { name: 'update.yaml', hardRole: 'updater-metadata', roles: ['updater-metadata'] },
  { name: 'appcast.xml', hardRole: 'updater-metadata', roles: ['updater-metadata'] },
  { name: 'foo-source-code.zip', hardRole: 'source', roles: ['source'] },
  { name: 'foo-src.tar.gz', hardRole: 'source', roles: ['source'] },
  { name: 'foo-win64.zip', size: 0, hardRole: 'empty', roles: ['empty'] },
  { name: 'foo-debug-x64.exe', hardRole: null, roles: ['debug'] },
  { name: 'foo-sdk-windows-x64.zip', hardRole: null, roles: ['sdk'] },
  { name: 'foo-server-windows-amd64.zip', hardRole: null, roles: ['server'] },
  { name: 'foo-headless-linux.tar.gz', hardRole: null, roles: ['server'] },
  { name: 'foo-nightly-win64.exe', hardRole: null, roles: ['nightly'] },
  { name: 'foo-canary-setup.exe', hardRole: null, roles: ['nightly'] },
  { name: 'foo-plugin-windows.zip', hardRole: null, roles: ['plugin'] },
  { name: 'foo-cli-windows-amd64.exe', hardRole: null, roles: ['cli'] },
  { name: 'foo-win64-portable.zip', hardRole: null, roles: ['portable'] },
  { name: 'foo-windows-standalone.exe', hardRole: null, roles: ['portable'] },
  { name: 'foo-self-contained-win64.zip', hardRole: null, roles: ['portable'] },
  { name: 'foo-debug-server-cli.zip', hardRole: null, roles: ['debug', 'server', 'cli'] },
  { name: 'foo-resources.zip', hardRole: null, roles: [] },
  { name: 'Foo-4.2.1-setup-win64.exe', hardRole: null, roles: [] },
];

describe('detectRoles', () => {
  it.each(ROLE_CASES)('$name', ({ name, size, hardRole, roles }) => {
    const r = detectRoles(tokenize(name), size ?? 1000);
    expect(r.hardRole).toBe(hardRole);
    expect(r.roles).toEqual(roles);
  });

  it('regression: the token "resources" is never source', () => {
    expect(detectRoles(tokenize('foo-resources-win64.zip'), 1).hardRole).toBeNull();
  });
});

interface KindCase {
  name: string;
  kind: PackageKind;
  weight: number;
}

const KIND_CASES: KindCase[] = [
  { name: 'Foo_4.2.1_x64.msi', kind: 'windows-installer', weight: 35 },
  { name: 'foo.msix', kind: 'windows-installer', weight: 32 },
  { name: 'foo.appxbundle', kind: 'windows-installer', weight: 32 },
  { name: 'Foo-4.2.1-setup-win64.exe', kind: 'windows-installer', weight: 34 },
  { name: 'foo-setup-installer-nsis.exe', kind: 'windows-installer', weight: 34 },
  { name: 'foo.exe', kind: 'windows-executable', weight: 28 },
  { name: 'foo-windows-standalone.exe', kind: 'windows-executable', weight: 28 },
  { name: 'foo-win64-portable.zip', kind: 'portable-archive', weight: 16 },
  { name: 'foo-msvc-x64.7z', kind: 'portable-archive', weight: 12 },
  { name: 'foo-win64.tar.gz', kind: 'portable-archive', weight: 2 },
  { name: 'foo.zip', kind: 'generic-archive', weight: 8 },
  { name: 'foo-linux-x64.tar.gz', kind: 'generic-archive', weight: 8 },
  { name: 'foo.tgz', kind: 'generic-archive', weight: 8 },
  { name: 'foo-macos-universal.dmg', kind: 'macos-installer', weight: 35 },
  { name: 'foo.pkg', kind: 'macos-installer', weight: 35 },
  { name: 'Foo.app.zip', kind: 'macos-application', weight: 32 },
  { name: 'foo-linux-x86_64.AppImage', kind: 'linux-appimage', weight: 34 },
  { name: 'foo_amd64.deb', kind: 'linux-deb', weight: 30 },
  { name: 'foo.x86_64.rpm', kind: 'linux-rpm', weight: 30 },
  { name: 'foo.jar', kind: 'java-archive', weight: 4 },
  { name: 'foo.txt', kind: 'unknown', weight: 0 },
];

describe('detectPackageKind', () => {
  it.each(KIND_CASES)('$name', ({ name, kind, weight }) => {
    const t = tokenize(name);
    expect(detectPackageKind(t, detectOperatingSystems(t).systems)).toEqual({ kind, formatWeight: weight });
  });

  it('regression: a bare .exe is an executable, not an installer', () => {
    const t = tokenize('foo.exe');
    expect(detectPackageKind(t, ['windows']).kind).toBe('windows-executable');
  });

  it('installer words never stack', () => {
    const one = detectPackageKind(tokenize('foo-setup.exe'), ['windows']).formatWeight;
    const three = detectPackageKind(tokenize('foo-setup-install-inno.exe'), ['windows']).formatWeight;
    expect(three).toBe(one);
  });
});

describe('describePackage', () => {
  const KINDS: PackageKind[] = [
    'windows-installer', 'windows-executable', 'portable-archive', 'macos-installer',
    'macos-application', 'linux-appimage', 'linux-deb', 'linux-rpm', 'generic-archive',
    'java-archive', 'source', 'checksum', 'signature', 'symbols', 'sdk', 'updater-metadata', 'unknown',
  ];
  it('labels every kind', () => {
    for (const kind of KINDS) expect(describePackage(kind).length).toBeGreaterThan(0);
    expect(describePackage('windows-installer')).toBe('Windows installer');
    expect(describePackage('java-archive')).toContain('Java');
  });
});
