import { describe, expect, it } from 'vitest';
import type { ExtensionSettings } from '../src/shared/messages';
import { normalizePlatform, resolvePlatform } from '../src/platform/normalize-platform';
import { DEFAULT_SETTINGS } from '../src/storage/settings';

describe('normalizePlatform', () => {
  const cases: [string, string, string, string][] = [
    ['win', 'x86-64', 'windows', 'x64'],
    ['win', 'arm64', 'windows', 'arm64'],
    ['mac', 'arm64', 'macos', 'arm64'],
    // Firefox spells 64-bit ARM "aarch64"; Chrome spells it "arm64".
    ['mac', 'aarch64', 'macos', 'arm64'],
    ['mac', 'x86-64', 'macos', 'x64'],
    ['linux', 'x86-64', 'linux', 'x64'],
    ['linux', 'x86-32', 'linux', 'x86'],
    ['linux', 'arm', 'linux', 'arm'],
    ['linux', 'riscv64', 'linux', 'riscv64'],
    ['android', 'aarch64', 'android', 'arm64'],
    ['cros', 'x86-64', 'chromeos', 'x64'],
    ['openbsd', 'x86-64', 'openbsd', 'x64'],
    ['beos', 'mips', 'unknown', 'unknown'],
    ['', '', 'unknown', 'unknown'],
  ];

  it.each(cases)('maps %s/%s to %s/%s', (os, arch, expectedOs, expectedArch) => {
    expect(normalizePlatform({ os, arch })).toEqual({ os: expectedOs, arch: expectedArch });
  });
});

describe('resolvePlatform', () => {
  const detected = { os: 'linux', arch: 'x64' } as const;

  const withOverrides = (
    os: ExtensionSettings['operatingSystemOverride'],
    arch: ExtensionSettings['architectureOverride'],
  ): ExtensionSettings => ({
    ...DEFAULT_SETTINGS,
    operatingSystemOverride: os,
    architectureOverride: arch,
  });

  it('keeps the detected platform when both overrides are auto', () => {
    expect(resolvePlatform(detected, withOverrides('auto', 'auto'))).toEqual({
      os: 'linux',
      arch: 'x64',
      detectedOs: 'linux',
      detectedArch: 'x64',
      overridden: false,
    });
  });

  it('applies an OS override alone', () => {
    expect(resolvePlatform(detected, withOverrides('windows', 'auto'))).toEqual({
      os: 'windows',
      arch: 'x64',
      detectedOs: 'linux',
      detectedArch: 'x64',
      overridden: true,
    });
  });

  it('applies an architecture override alone', () => {
    expect(resolvePlatform(detected, withOverrides('auto', 'arm64'))).toEqual({
      os: 'linux',
      arch: 'arm64',
      detectedOs: 'linux',
      detectedArch: 'x64',
      overridden: true,
    });
  });

  it('applies both overrides', () => {
    expect(resolvePlatform(detected, withOverrides('macos', 'universal'))).toEqual({
      os: 'macos',
      arch: 'universal',
      detectedOs: 'linux',
      detectedArch: 'x64',
      overridden: true,
    });
  });
});
