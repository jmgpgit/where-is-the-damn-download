/**
 * Domain types for release-asset classification.
 *
 * This layer is pure: no browser, no network, no DOM, no clock, no globals.
 * Everything the classifier needs arrives through these types.
 */

export type OperatingSystem =
  | 'windows'
  | 'macos'
  | 'linux'
  | 'android'
  | 'chromeos'
  | 'openbsd'
  | 'unknown';

export type Architecture =
  | 'x64'
  | 'arm64'
  | 'x86'
  | 'arm'
  | 'riscv64'
  | 'universal'
  | 'unknown';

export type PackageKind =
  | 'windows-installer'
  | 'windows-executable'
  | 'portable-archive'
  | 'macos-installer'
  | 'macos-application'
  | 'linux-appimage'
  | 'linux-deb'
  | 'linux-rpm'
  | 'generic-archive'
  | 'java-archive'
  | 'source'
  | 'checksum'
  | 'signature'
  | 'symbols'
  | 'sdk'
  | 'updater-metadata'
  | 'unknown';

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface UserPlatform {
  os: OperatingSystem;
  arch: Architecture;
  detectedOs: OperatingSystem;
  detectedArch: Architecture;
  overridden: boolean;
}

export interface UserPreferences {
  mode: 'simple' | 'advanced';
  packagePreference: 'installer' | 'portable' | 'none';
  releaseChannel: 'stable' | 'include-prerelease';
  showSourceWarnings: boolean;
}

/** What the classifier needs to know about one uploaded asset. */
export interface AssetInput {
  assetId: number;
  name: string;
  label?: string | null;
  size: number;
  downloadCount: number;
  downloadUrl: string;
}

export interface RuleEvidence {
  ruleId: string;
  category: 'os' | 'architecture' | 'format' | 'role' | 'preference' | 'popularity';
  effect: 'positive' | 'negative' | 'exclude' | 'informational';
  weight: number;
  explanation: string;
}

export interface ClassifiedAsset {
  assetId: number;
  name: string;
  label?: string | null;
  size: number;
  downloadCount: number;
  downloadUrl: string;
  detectedOperatingSystems: OperatingSystem[];
  detectedArchitectures: Architecture[];
  packageKind: PackageKind;
  roles: string[];
  eligible: boolean;
  score: number;
  evidence: RuleEvidence[];
}

export interface Recommendation {
  confidence: Confidence;
  primary?: ClassifiedAsset;
  alternatives: ClassifiedAsset[];
  excluded: ClassifiedAsset[];
  summary: string;
  warnings: string[];
}
