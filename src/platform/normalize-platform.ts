/**
 * Maps runtime.getPlatformInfo() strings onto domain types. This module exists
 * because the browsers disagree: Firefox reports 64-bit ARM as "aarch64",
 * Chrome as "arm64". Everything downstream sees only the domain vocabulary.
 */

import type { Architecture, OperatingSystem, UserPlatform } from '../domain/asset-types';
import type { ExtensionSettings } from '../shared/messages';

const OS_MAP: Record<string, OperatingSystem> = {
  win: 'windows',
  mac: 'macos',
  linux: 'linux',
  android: 'android',
  cros: 'chromeos',
  openbsd: 'openbsd',
};

const ARCH_MAP: Record<string, Architecture> = {
  'x86-64': 'x64',
  'x86-32': 'x86',
  arm64: 'arm64',
  aarch64: 'arm64',
  arm: 'arm',
  riscv64: 'riscv64',
};

export function normalizePlatform(info: { os: string; arch: string }): {
  os: OperatingSystem;
  arch: Architecture;
} {
  return { os: OS_MAP[info.os] ?? 'unknown', arch: ARCH_MAP[info.arch] ?? 'unknown' };
}

export function resolvePlatform(
  detected: { os: OperatingSystem; arch: Architecture },
  settings: ExtensionSettings,
): UserPlatform {
  const os =
    settings.operatingSystemOverride === 'auto' ? detected.os : settings.operatingSystemOverride;
  const arch =
    settings.architectureOverride === 'auto' ? detected.arch : settings.architectureOverride;
  return {
    os,
    arch,
    detectedOs: detected.os,
    detectedArch: detected.arch,
    overridden:
      settings.operatingSystemOverride !== 'auto' || settings.architectureOverride !== 'auto',
  };
}
