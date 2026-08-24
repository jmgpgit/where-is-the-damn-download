/**
 * Settings persistence. Stored as a versioned envelope under one key; there is
 * no migrations module — bumping SETTINGS_SCHEMA_VERSION makes old envelopes
 * unreadable and loadSettings falls back to defaults. Losing preferences on a
 * schema break is the accepted migration story for now.
 */

import type { ExtensionSettings } from '../shared/messages';
import { isValidSettings } from '../shared/messages';

/** MV3 promise-API subset shared by chrome.storage.{sync,local,session}. */
export interface StorageAreaLike {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

// Callers bind an area themselves (ext.storage.sync for settings) — importing
// browser-api here would evaluate `chrome` at load time and break node tests.
export const SETTINGS_KEY = 'wtd:settings';
export const SETTINGS_SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  mode: 'simple',
  operatingSystemOverride: 'auto',
  architectureOverride: 'auto',
  packagePreference: 'installer',
  releaseChannel: 'stable',
  showSourceWarnings: true,
  showOnRepositoryHome: true,
  showOnReleasePages: true,
};

const FIELDS = Object.keys(DEFAULT_SETTINGS) as (keyof ExtensionSettings)[];

export async function loadSettings(area: StorageAreaLike): Promise<ExtensionSettings> {
  let raw: Record<string, unknown>;
  try {
    raw = await area.get(SETTINGS_KEY);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  const envelope = raw[SETTINGS_KEY];
  if (typeof envelope !== 'object' || envelope === null) return { ...DEFAULT_SETTINGS };
  const e = envelope as Record<string, unknown>;
  // A future version cannot be read safely; defaults over guessing.
  if (e['schemaVersion'] !== SETTINGS_SCHEMA_VERSION) return { ...DEFAULT_SETTINGS };
  const stored = e['settings'];
  if (typeof stored !== 'object' || stored === null) return { ...DEFAULT_SETTINGS };
  const s = stored as Record<string, unknown>;
  // Field-wise salvage: keep each stored value only if substituting it into an
  // otherwise-valid object still validates. Also strips unknown keys.
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const field of FIELDS) {
    if (field in s && isValidSettings({ ...DEFAULT_SETTINGS, [field]: s[field] })) {
      merged[field] = s[field];
    }
  }
  // Always true by construction; the guard doubles as the type narrowing.
  return isValidSettings(merged) ? merged : { ...DEFAULT_SETTINGS };
}

export async function saveSettings(
  area: StorageAreaLike,
  settings: ExtensionSettings,
): Promise<void> {
  await area.set({
    [SETTINGS_KEY]: { schemaVersion: SETTINGS_SCHEMA_VERSION, settings },
  });
}
