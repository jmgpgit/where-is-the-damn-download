/** `__DEV__` is defined by tools/build.mjs; absent under vitest. */
declare const __DEV__: boolean | undefined;

const DEV = typeof __DEV__ !== 'undefined' && __DEV__ === true;

/** Diagnostic logging, compiled to a no-op in production builds. */
export function debug(...args: unknown[]): void {
  if (DEV) console.debug('[wheres-the-download]', ...args);
}
