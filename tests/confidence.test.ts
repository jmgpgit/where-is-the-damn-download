import { describe, expect, it } from 'vitest';
import type { AssetInput, Confidence, UserPlatform, UserPreferences } from '../src/domain/asset-types';
import { assessConfidence } from '../src/domain/confidence';
import { recommend } from '../src/domain/recommend';

const WIN_X64: UserPlatform = { os: 'windows', arch: 'x64', detectedOs: 'windows', detectedArch: 'x64', overridden: false };
const PREFS: UserPreferences = { mode: 'simple', packagePreference: 'none', releaseChannel: 'stable', showSourceWarnings: true };

const assets = (...names: string[]): AssetInput[] =>
  names.map((name, i) => ({ assetId: i + 1, name, label: null, size: 1000, downloadCount: 0, downloadUrl: `https://example.invalid/${name}` }));

interface Case {
  title: string;
  names: string[];
  confidence: Confidence;
}

const CASES: Case[] = [
  { title: 'no assets', names: [], confidence: 'none' },
  { title: 'only excluded assets', names: ['foo.sha256', 'foo-src.tar.gz', 'foo-win-arm64.exe'], confidence: 'none' },
  { title: 'single generic zip is weak: no primary', names: ['foo.zip'], confidence: 'none' },
  { title: 'generic zip plus generic tarball', names: ['foo.zip', 'foo.tar.gz'], confidence: 'none' },
  { title: 'near-tie editions are variants: downloads decide, never low', names: ['foo-win64-home.zip', 'foo-win64-pro.zip'], confidence: 'medium' },
  { title: 'near-tie with a friendlier rival is still low', names: ['foo-windows-x64.exe', 'foo-x64.msi'], confidence: 'low' },
  { title: 'portable zip trailing an executable by a few points is not ambiguity', names: ['foo-x64.exe', 'foo-windows-x64.zip'], confidence: 'medium' },
  { title: '32-bit build trailing by a few points is not ambiguity', names: ['foo.exe', 'foo-win-x86.zip'], confidence: 'medium' },
  { title: 'scripts never reach high', names: ['foo-installer.ps1'], confidence: 'medium' },
  { title: 'explicit installer with clear margin', names: ['Foo-4.2.1-setup-win64.exe', 'foo-win64-portable.zip'], confidence: 'high' },
  { title: 'installer alone', names: ['Foo-4.2.1-setup-win64.exe'], confidence: 'high' },
  { title: 'windows archive rather than installer', names: ['foo-win64.zip'], confidence: 'medium' },
  { title: 'bare exe: os by extension, arch unknown', names: ['foo.exe'], confidence: 'medium' },
  { title: 'arch unknown with several arch variants present', names: ['foo-windows-setup.exe', 'foo-win-x64.tar.gz', 'foo-win32-ia32.zip'], confidence: 'low' },
  { title: '32-bit primary on 64-bit computer', names: ['foo-win32-ia32.zip'], confidence: 'medium' },
  { title: 'modest margin', names: ['foo-win64.exe', 'foo-x86_64-pc-windows-msvc.zip'], confidence: 'medium' },
  { title: 'penalized role as primary', names: ['foo-debug-win64.exe'], confidence: 'medium' },
  { title: 'only a jar', names: ['foo.jar'], confidence: 'low' },
];

describe('confidence via recommend', () => {
  it.each(CASES)('$title', ({ names, confidence }) => {
    expect(recommend(assets(...names), WIN_X64, PREFS).confidence).toBe(confidence);
  });
});

describe('assessConfidence', () => {
  it('is none for an empty ranking', () => {
    expect(assessConfidence([])).toBe('none');
  });
});
