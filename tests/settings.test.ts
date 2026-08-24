import { describe, expect, it } from 'vitest';
import type { StorageAreaLike } from '../src/storage/settings';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  SETTINGS_SCHEMA_VERSION,
  loadSettings,
  saveSettings,
} from '../src/storage/settings';

function fakeArea(initial: Record<string, unknown> = {}): {
  area: StorageAreaLike;
  data: Record<string, unknown>;
} {
  const data: Record<string, unknown> = { ...initial };
  const area: StorageAreaLike = {
    async get(keys) {
      if (keys === null) return { ...data };
      const out: Record<string, unknown> = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (key in data) out[key] = data[key];
      }
      return out;
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
  };
  return { area, data };
}

const envelope = (schemaVersion: unknown, settings: unknown): Record<string, unknown> => ({
  [SETTINGS_KEY]: { schemaVersion, settings },
});

describe('loadSettings', () => {
  it('returns defaults on an empty area', async () => {
    const { area } = fakeArea();
    expect(await loadSettings(area)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through saveSettings', async () => {
    const { area } = fakeArea();
    const custom = { ...DEFAULT_SETTINGS, mode: 'advanced' as const, enabled: false };
    await saveSettings(area, custom);
    expect(await loadSettings(area)).toEqual(custom);
  });

  it('returns defaults for a corrupt envelope', async () => {
    const { area } = fakeArea({ [SETTINGS_KEY]: 'not-an-envelope' });
    expect(await loadSettings(area)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults when the stored settings are not an object', async () => {
    const { area } = fakeArea(envelope(SETTINGS_SCHEMA_VERSION, 42));
    expect(await loadSettings(area)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults for a future schemaVersion', async () => {
    const { area } = fakeArea(
      envelope(SETTINGS_SCHEMA_VERSION + 1, { ...DEFAULT_SETTINGS, mode: 'advanced' }),
    );
    expect(await loadSettings(area)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid fields and falls back per-field for invalid ones', async () => {
    const { area } = fakeArea(
      envelope(SETTINGS_SCHEMA_VERSION, {
        mode: 'advanced',
        enabled: 'yes',
        packagePreference: 'portable',
        architectureOverride: 'sparc',
        bogusExtra: true,
      }),
    );
    expect(await loadSettings(area)).toEqual({
      ...DEFAULT_SETTINGS,
      mode: 'advanced',
      packagePreference: 'portable',
    });
  });

  it('returns defaults when the area throws', async () => {
    const area: StorageAreaLike = {
      get: () => Promise.reject(new Error('gone')),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };
    expect(await loadSettings(area)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('saveSettings', () => {
  it('persists a versioned envelope under the settings key', async () => {
    const { area, data } = fakeArea();
    await saveSettings(area, DEFAULT_SETTINGS);
    expect(data[SETTINGS_KEY]).toEqual({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      settings: DEFAULT_SETTINGS,
    });
  });
});
