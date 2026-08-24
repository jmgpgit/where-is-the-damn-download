/**
 * Chrome ships `chrome`; Firefox ships both `browser` and `chrome`. In MV3
 * both promisify everything this extension uses (storage, runtime), so no
 * polyfill is needed. Preferring `browser` keeps Firefox on its native
 * promise implementation.
 */
declare const browser: typeof chrome | undefined;

export const ext: typeof chrome = typeof browser === 'undefined' ? chrome : browser;
