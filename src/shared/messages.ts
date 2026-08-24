/**
 * The typed protocol between the content script and the background context,
 * plus the validated release shapes that cross that boundary.
 *
 * The content script never sends URLs — only identifiers. The background
 * constructs every GitHub API URL itself, so this protocol cannot be used as
 * a fetch proxy.
 */

import type { OperatingSystem, Architecture, UserPlatform } from '../domain/asset-types';

// --- release data (validated, trimmed; produced by github/api-validation) ----

export interface ReleaseAsset {
  id: number;
  name: string;
  label: string | null;
  contentType: string | null;
  size: number;
  downloadCount: number;
  /** Already validated: https, GitHub-owned release-download location. */
  browserDownloadUrl: string;
  digest: string | null;
}

export interface ReleaseInfo {
  id: number;
  tagName: string;
  name: string | null;
  htmlUrl: string;
  prerelease: boolean;
  publishedAt: string | null;
  /** Only assets whose upload state is complete survive validation. */
  assets: ReleaseAsset[];
}

// --- release lookup ----------------------------------------------------------

export type ReleaseSelector =
  | { kind: 'latest' }
  | { kind: 'tag'; tag: string }
  | { kind: 'latest-including-prerelease' };

export type ReleaseResult =
  | { status: 'ok'; release: ReleaseInfo; stale: boolean }
  | { status: 'no-releases' }
  | { status: 'no-stable-release'; prereleaseAvailable: boolean }
  | { status: 'repo-not-found' }
  | { status: 'rate-limited'; resetAt: number | null }
  | { status: 'network-error' }
  | { status: 'github-error' }
  | { status: 'invalid-response' };

// --- settings (persisted by storage/settings; part of the protocol) ---------

export interface ExtensionSettings {
  enabled: boolean;
  mode: 'simple' | 'advanced';
  operatingSystemOverride: 'auto' | OperatingSystem;
  architectureOverride: 'auto' | Architecture;
  packagePreference: 'installer' | 'portable' | 'none';
  releaseChannel: 'stable' | 'include-prerelease';
  showSourceWarnings: boolean;
  showOnRepositoryHome: boolean;
  showOnReleasePages: boolean;
}

// --- protocol ----------------------------------------------------------------

export type BackgroundRequest =
  | {
      type: 'get-state';
      owner: string;
      repo: string;
      selector: ReleaseSelector;
      /** Bypass the fresh-cache window (still throttled by the background). */
      forceRefresh?: boolean;
    }
  | { type: 'save-settings'; settings: ExtensionSettings };

export interface StateResponse {
  settings: ExtensionSettings;
  platform: UserPlatform;
  release: ReleaseResult;
}

export type BackgroundResponse =
  | { type: 'state'; state: StateResponse }
  | { type: 'settings-saved'; settings: ExtensionSettings }
  | { type: 'bad-request' };

// --- validation (background treats incoming messages as untrusted) ----------

/** GitHub logins: alphanumeric and single hyphens, 1-39 chars. */
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
/** Repository names: word chars, dots and hyphens; "." and ".." are not repos. */
const REPO = /^(?!\.\.?$)[A-Za-z0-9_.-]{1,100}$/;

export function isValidOwner(owner: string): boolean {
  return OWNER.test(owner);
}

export function isValidRepo(repo: string): boolean {
  return REPO.test(repo);
}

/**
 * Tags may contain slashes and unicode; they are URL-encoded before use.
 * Rejects what git itself forbids in ref names: control characters, space,
 * DEL, and the characters ~ ^ : ? * [ \
 */
export function isValidTag(tag: string): boolean {
  if (tag.length === 0 || tag.length > 256) return false;
  for (const ch of tag) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 32 || code === 127) return false;
    if (ch === '~' || ch === '^' || ch === ':' || ch === '?' || ch === '*' || ch === '[') {
      return false;
    }
    if (ch === '\\') return false;
  }
  return true;
}

function isSelector(value: unknown): value is ReleaseSelector {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v['kind'] === 'latest' || v['kind'] === 'latest-including-prerelease') return true;
  return v['kind'] === 'tag' && typeof v['tag'] === 'string' && isValidTag(v['tag']);
}

const OS_VALUES = new Set([
  'auto',
  'windows',
  'macos',
  'linux',
  'android',
  'chromeos',
  'openbsd',
  'unknown',
]);
const ARCH_VALUES = new Set([
  'auto',
  'x64',
  'arm64',
  'x86',
  'arm',
  'riscv64',
  'universal',
  'unknown',
]);

export function isValidSettings(value: unknown): value is ExtensionSettings {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['enabled'] === 'boolean' &&
    (v['mode'] === 'simple' || v['mode'] === 'advanced') &&
    typeof v['operatingSystemOverride'] === 'string' &&
    OS_VALUES.has(v['operatingSystemOverride']) &&
    typeof v['architectureOverride'] === 'string' &&
    ARCH_VALUES.has(v['architectureOverride']) &&
    (v['packagePreference'] === 'installer' ||
      v['packagePreference'] === 'portable' ||
      v['packagePreference'] === 'none') &&
    (v['releaseChannel'] === 'stable' || v['releaseChannel'] === 'include-prerelease') &&
    typeof v['showSourceWarnings'] === 'boolean' &&
    typeof v['showOnRepositoryHome'] === 'boolean' &&
    typeof v['showOnReleasePages'] === 'boolean'
  );
}

/** Shape-validate an incoming message. Returns null for anything unexpected. */
export function parseBackgroundRequest(message: unknown): BackgroundRequest | null {
  if (typeof message !== 'object' || message === null) return null;
  const m = message as Record<string, unknown>;
  if (m['type'] === 'get-state') {
    if (
      typeof m['owner'] === 'string' &&
      isValidOwner(m['owner']) &&
      typeof m['repo'] === 'string' &&
      isValidRepo(m['repo']) &&
      isSelector(m['selector']) &&
      (m['forceRefresh'] === undefined || typeof m['forceRefresh'] === 'boolean')
    ) {
      const request: BackgroundRequest = {
        type: 'get-state',
        owner: m['owner'],
        repo: m['repo'],
        selector: m['selector'],
      };
      if (typeof m['forceRefresh'] === 'boolean') request.forceRefresh = m['forceRefresh'];
      return request;
    }
    return null;
  }
  if (m['type'] === 'save-settings' && isValidSettings(m['settings'])) {
    return { type: 'save-settings', settings: m['settings'] };
  }
  return null;
}
