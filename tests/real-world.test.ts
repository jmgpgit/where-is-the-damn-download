/**
 * Real GitHub releases snapshotted by `npm run probe -- owner/repo --save`.
 * Expectations are minimum confidence plus what must (not) be picked.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  Architecture,
  AssetInput,
  Confidence,
  OperatingSystem,
  PackageKind,
  Recommendation,
  UserPlatform,
  UserPreferences,
} from '../src/domain/asset-types';
import { recommend } from '../src/domain/recommend';

interface Fixture {
  repo: string;
  tag?: string;
  status?: 'no-releases';
  assets?: Array<{ name: string; size: number; downloadCount: number }>;
}

const DIR = fileURLToPath(new URL('./fixtures/real-world/', import.meta.url));
const FIXTURES = new Map<string, Fixture>(
  readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(`${DIR}${f}`, 'utf8')) as Fixture)
    .map((fx) => [fx.repo, fx]),
);

const PREFS: UserPreferences = { mode: 'simple', packagePreference: 'installer', releaseChannel: 'stable', showSourceWarnings: true };
const platform = (os: OperatingSystem, arch: Architecture): UserPlatform => ({ os, arch, detectedOs: os, detectedArch: arch, overridden: false });
const RANK: Readonly<Record<Confidence, number>> = { none: 0, low: 1, medium: 2, high: 3 };

function classify(repo: string, os: OperatingSystem, arch: Architecture): Recommendation {
  const fx = FIXTURES.get(repo);
  if (fx === undefined) throw new Error(`missing fixture for ${repo}`);
  const assets: AssetInput[] = (fx.assets ?? []).map((a, i) => ({
    assetId: i + 1,
    name: a.name,
    size: a.size,
    downloadCount: a.downloadCount,
    downloadUrl: `https://github.com/${repo}/releases/download/${fx.tag ?? ''}/${a.name}`,
  }));
  return recommend(assets, platform(os, arch), PREFS);
}

interface Expectation {
  repo: string;
  /** Exact name, a predicate on the name, or null for "no primary". */
  primary: string | ((name: string) => boolean) | null;
  /** Minimum confidence ('none' requires exactly none). */
  confidence: Confidence;
  kind?: PackageKind;
  firstAlternative?: string;
  /** Must be neither primary nor alternative. */
  excluded?: string[];
  /** Must not be primary. */
  notPrimary?: string[];
  /** Must be neither primary nor the first alternative. */
  notTop?: string[];
}

const NONE = (repo: string): Expectation => ({ repo, primary: null, confidence: 'none' });
const EMPTY_REPOS = ['microsoft/vscode', 'hashicorp/terraform', 'nodejs/node', 'kubernetes/kubernetes', 'fastapi/fastapi', 'golang/go', 'python/cpython'];

const WINDOWS_X64: Expectation[] = [
  { repo: 'ShareX/ShareX', primary: 'ShareX-21.0.0-setup-x64.exe', confidence: 'high' },
  { repo: 'pbatard/rufus', primary: 'rufus-4.15.exe', confidence: 'medium', firstAlternative: 'rufus-4.15p.exe' },
  { repo: 'yt-dlp/yt-dlp', primary: 'yt-dlp.exe', confidence: 'medium' },
  { repo: 'hluk/CopyQ', primary: 'copyq-16.0.0-setup.exe', confidence: 'medium' },
  { repo: 'balena-io/etcher', primary: 'balenaEtcher-2.1.6.Setup.exe', confidence: 'medium' },
  {
    repo: 'obsproject/obs-studio',
    primary: 'OBS-Studio-32.2.2-Windows-x64-Installer.exe',
    confidence: 'high',
    excluded: ['OBS-Studio-32.2.2-Windows-x64-PDBs.zip', 'OBS-Studio-32.2.2-Sources.tar.gz'],
  },
  {
    repo: 'jgraph/drawio-desktop',
    primary: 'draw.io-31.3.2-windows-installer.exe',
    confidence: 'medium',
    notPrimary: ['draw.io-ia32-31.3.2-windows-32bit-installer.exe'],
  },
  { repo: 'godotengine/godot', primary: 'Godot_v4.7.2-stable_win64.exe.zip', confidence: 'medium' },
  { repo: 'PowerShell/PowerShell', primary: 'PowerShell-7.6.5-win-x64.msi', confidence: 'high' },
  { repo: 'neovim/neovim', primary: 'nvim-win64.msi', confidence: 'high' },
  { repo: 'BurntSushi/ripgrep', primary: 'ripgrep-15.2.0-x86_64-pc-windows-msvc.zip', confidence: 'medium' },
  { repo: 'sharkdp/fd', primary: 'fd-v10.4.2-x86_64-pc-windows-msvc.zip', confidence: 'medium' },
  { repo: 'sharkdp/bat', primary: 'bat-v0.26.1-x86_64-pc-windows-msvc.zip', confidence: 'medium' },
  {
    repo: 'astral-sh/ruff',
    primary: 'ruff-x86_64-pc-windows-msvc.zip',
    confidence: 'medium',
    excluded: ['ruff-installer.sh', 'dist-manifest.json'],
    notTop: ['ruff-installer.ps1'],
  },
  {
    repo: 'junegunn/fzf',
    primary: 'fzf-0.74.3-windows_amd64.zip',
    confidence: 'medium',
    excluded: ['fzf-0.74.3-freebsd_amd64.tar.gz', 'fzf-0.74.3-openbsd_amd64.tar.gz', 'fzf-0.74.3-android_arm64.tar.gz', 'fzf_0.74.3_armv6.deb'],
  },
  { repo: 'qbittorrent/qBittorrent', primary: (n) => n.endsWith('x64_setup.exe'), confidence: 'medium' },
  {
    repo: 'microsoft/PowerToys',
    primary: 'PowerToysUserSetup-0.100.2-x64.exe',
    confidence: 'medium',
    kind: 'windows-installer',
    firstAlternative: 'PowerToysSetup-0.100.2-x64.exe',
  },
  NONE('pandas-dev/pandas'),
  NONE('psf/requests'),
  ...EMPTY_REPOS.map(NONE),
];

const MACOS_ARM64: Expectation[] = [
  { repo: 'balena-io/etcher', primary: 'balenaEtcher-2.1.6-arm64.dmg', confidence: 'high' },
  { repo: 'jgraph/drawio-desktop', primary: 'draw.io-arm64-31.3.2.dmg', confidence: 'medium' },
  { repo: 'hluk/CopyQ', primary: 'CopyQ-16.0.0-macos-12-m1.dmg', confidence: 'medium' },
  {
    repo: 'obsproject/obs-studio',
    primary: 'OBS-Studio-32.2.2-macOS-Apple.dmg',
    confidence: 'medium',
    excluded: ['OBS-Studio-32.2.2-macOS-Intel.dmg', 'OBS-Studio-32.2.2-macOS-Apple-dSYMs.tar.xz', 'OBS-Studio-32.2.2-macOS-Intel-dSYMs.tar.xz'],
  },
  { repo: 'PowerShell/PowerShell', primary: 'powershell-7.6.5-osx-arm64.pkg', confidence: 'medium' },
  { repo: 'BurntSushi/ripgrep', primary: 'ripgrep-15.2.0-aarch64-apple-darwin.tar.gz', confidence: 'medium' },
  { repo: 'sharkdp/fd', primary: 'fd-v10.4.2-aarch64-apple-darwin.tar.gz', confidence: 'medium' },
  { repo: 'sharkdp/bat', primary: 'bat-v0.26.1-aarch64-apple-darwin.tar.gz', confidence: 'medium' },
  { repo: 'astral-sh/ruff', primary: 'ruff-aarch64-apple-darwin.tar.gz', confidence: 'medium' },
  { repo: 'neovim/neovim', primary: 'nvim-macos-arm64.tar.gz', confidence: 'medium' },
  NONE('ShareX/ShareX'),
  NONE('microsoft/PowerToys'),
  NONE('pbatard/rufus'),
  ...EMPTY_REPOS.map(NONE),
];

const LINUX_X64: Expectation[] = [
  { repo: 'hluk/CopyQ', primary: 'CopyQ-16.0.0-x86_64.AppImage', confidence: 'high' },
  { repo: 'neovim/neovim', primary: 'nvim-linux-x86_64.appimage', confidence: 'high', excluded: ['nvim-linux-x86_64.appimage.zsync'] },
  { repo: 'qbittorrent/qBittorrent', primary: (n) => n.endsWith('x86_64.AppImage'), confidence: 'medium' },
  // distro unknown: AppImage, deb and rpm are legitimately close
  { repo: 'jgraph/drawio-desktop', primary: (n) => /^drawio-(x86_64|amd64)-31\.3\.2\.(AppImage|deb|rpm)$/.test(n), confidence: 'low' },
  { repo: 'BurntSushi/ripgrep', primary: 'ripgrep_15.2.0-1_amd64.deb', confidence: 'medium', excluded: ['ripgrep-15.2.0-s390x-unknown-linux-gnu.tar.gz'] },
  NONE('ShareX/ShareX'),
  NONE('microsoft/PowerToys'),
  ...EMPTY_REPOS.map(NONE),
];

function check(rec: Recommendation, e: Expectation): void {
  const listed = [rec.primary, ...rec.alternatives].filter((a) => a !== undefined).map((a) => a.name);
  if (e.primary === null) {
    expect(rec.primary).toBeUndefined();
    expect(rec.confidence).toBe('none');
  } else {
    expect(rec.primary, e.repo).toBeDefined();
    const name = rec.primary?.name ?? '';
    if (typeof e.primary === 'string') expect(name).toBe(e.primary);
    else expect(e.primary(name), `unexpected primary ${name}`).toBe(true);
    expect(RANK[rec.confidence], `confidence ${rec.confidence}`).toBeGreaterThanOrEqual(RANK[e.confidence]);
  }
  if (e.kind) expect(rec.primary?.packageKind).toBe(e.kind);
  if (e.firstAlternative) expect(rec.alternatives[0]?.name).toBe(e.firstAlternative);
  for (const n of e.excluded ?? []) {
    expect(listed, `${n} must be excluded`).not.toContain(n);
    expect(rec.excluded.map((a) => a.name)).toContain(n);
  }
  for (const n of e.notPrimary ?? []) expect(rec.primary?.name).not.toBe(n);
  for (const n of e.notTop ?? []) expect(listed.slice(0, 2)).not.toContain(n);
}

describe('real-world releases', () => {
  it('has all 26 fixtures', () => {
    expect(FIXTURES.size).toBe(26);
  });

  describe('windows/x64', () => {
    it.each(WINDOWS_X64)('$repo', (e) => check(classify(e.repo, 'windows', 'x64'), e));
  });

  describe('macos/arm64', () => {
    it.each(MACOS_ARM64)('$repo', (e) => check(classify(e.repo, 'macos', 'arm64'), e));
  });

  describe('linux/x64', () => {
    it.each(LINUX_X64)('$repo', (e) => check(classify(e.repo, 'linux', 'x64'), e));
  });

  it('every asset lands in exactly one bucket, on every platform', () => {
    for (const [repo, fx] of FIXTURES) {
      for (const [os, arch] of [['windows', 'x64'], ['macos', 'arm64'], ['linux', 'x64']] as const) {
        const rec = classify(repo, os, arch);
        const total = (rec.primary ? 1 : 0) + rec.alternatives.length + rec.excluded.length;
        expect(total, `${repo} on ${os}`).toBe(fx.assets?.length ?? 0);
      }
    }
  });
});
