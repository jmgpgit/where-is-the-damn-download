import { describe, expect, it } from 'vitest';
import type { AssetInput, UserPlatform, UserPreferences } from '../src/domain/asset-types';
import { recommend } from '../src/domain/recommend';
import { detectRoles } from '../src/domain/role-detection';
import { tokenize } from '../src/domain/tokenizer';

const shaped = (name: string): boolean => detectRoles(tokenize(name), 1000).cliShaped;

describe('command-line packaging shapes', () => {
  it('recognises target triples and bare OS binaries', () => {
    for (const name of [
      'ripgrep-15.2.0-x86_64-pc-windows-msvc.zip',
      'ripgrep-15.2.0-x86_64-pc-windows-gnu.zip',
      'fd-v10.4.2-aarch64-apple-darwin.tar.gz',
      'ruff-x86_64-unknown-linux-musl.tar.gz',
      'bat-v0.26.1-arm-unknown-linux-gnueabihf.tar.gz',
      'yt-dlp_linux',
      'yt-dlp_macos',
    ]) {
      expect(shaped(name), name).toBe(true);
    }
  });

  it('leaves desktop applications alone', () => {
    for (const name of [
      'ShareX-21.0.0-setup-x64.exe',
      'rufus-4.15.exe',
      'balenaEtcher-2.1.6.Setup.exe',
      'PowerShell-7.6.5-win-x64.msi',
      'Godot_v4.7.2-stable_win64.exe.zip',
      'OBS-Studio-32.2.2-Windows-x64-Installer.exe',
      'draw.io-arm64-31.3.2.dmg',
      'CopyQ-16.0.0-x86_64.AppImage',
      'nvim-win64.msi',
      // An OS word with an extension is an ordinary archive, not a bare binary.
      'yt-dlp_linux.zip',
      'balenaEtcher-linux-x64-2.1.6.zip',
    ]) {
      expect(shaped(name), name).toBe(false);
    }
  });

  it('does not double up when the name already says cli', () => {
    const roles = detectRoles(tokenize('foo-cli-x86_64-pc-windows-msvc.zip'), 1000);
    expect(roles.cli).toBe(true);
    expect(roles.cliShaped).toBe(false);
  });
});

describe('the warning a beginner sees', () => {
  const prefs: UserPreferences = {
    mode: 'simple',
    packagePreference: 'installer',
    releaseChannel: 'stable',
    showSourceWarnings: true,
  };
  const windows: UserPlatform = {
    os: 'windows',
    arch: 'x64',
    detectedOs: 'windows',
    detectedArch: 'x64',
    overridden: false,
  };
  const asset = (name: string): AssetInput => ({
    assetId: 1,
    name,
    size: 1000,
    downloadCount: 10,
    downloadUrl: `https://github.com/o/r/releases/download/v1/${name}`,
  });

  it('warns that a triple-named build is probably a terminal tool', () => {
    const rec = recommend([asset('ripgrep-15.2.0-x86_64-pc-windows-msvc.zip')], windows, prefs);
    expect(rec.primary?.roles).toContain('cli-shaped');
    expect(rec.warnings.join(' ')).toContain('command-line tool');
    // A hint must never cost the asset its place.
    expect(rec.primary?.evidence.find((e) => e.ruleId === 'role-cli-shaped')?.weight).toBe(0);
  });

  it('says nothing of the sort about an installer', () => {
    const rec = recommend([asset('ShareX-21.0.0-setup-x64.exe')], windows, prefs);
    expect(rec.warnings.join(' ')).not.toContain('command-line');
  });
});
