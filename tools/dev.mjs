#!/usr/bin/env node
/**
 * Launch a browser with the extension loaded, on a repository that publishes
 * releases.
 *
 *   npm start                 Firefox, persistent profile in .dev-profile/firefox
 *   npm start -- --chrome     Chromium/Chrome, persistent profile in .dev-profile/chromium
 *   npm start -- --fresh      throwaway profile, what plain `web-ext run` gives
 *   npm start -- --devtools   anything else is handed straight to web-ext
 *
 * A persistent profile keeps the GitHub login and the extension's own settings
 * between launches. The dev build (__DEV__ logging, inline source maps) is
 * rebuilt whenever src/, icons/ or manifest.src.json change; web-ext watches
 * dist/<target> and reloads the extension when it does.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB_EXT = path.join(ROOT, 'node_modules', 'web-ext', 'bin', 'web-ext.js');
const BUILD = path.join(ROOT, 'tools', 'build.mjs');

/** A repository with installers for every platform, so the panel has work to do. */
const START_URL = 'https://github.com/microsoft/PowerToys';

const argv = process.argv.slice(2);
const chrome = argv.includes('--chrome');
const fresh = argv.includes('--fresh');
const passthrough = argv.filter((arg) => arg !== '--chrome' && arg !== '--fresh');

// Matches the dist/ folder names build.mjs emits.
const target = chrome ? 'chrome' : 'firefox';
const SOURCE = path.join(ROOT, 'dist', target);
const PROFILE = path.join(ROOT, '.dev-profile', target);

if (!existsSync(WEB_EXT)) {
  throw new Error(`${WEB_EXT} is missing. Run \`npm install\` first.`);
}

function build() {
  const result = spawnSync(process.execPath, [BUILD, '--dev'], { cwd: ROOT, stdio: 'inherit' });
  return result.status === 0;
}

if (!build()) process.exit(1);

// Debounced at 100ms: one editor save can produce several events, and web-ext
// debounces its own watcher on top, so a burst of saves is one reload.
let timer = null;
const bump = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!build()) console.error('  rebuild failed; the browser still has the previous build');
  }, 100);
};
const watchers = [
  watch(path.join(ROOT, 'src'), { recursive: true }, bump),
  watch(path.join(ROOT, 'icons'), { recursive: true }, bump),
  watch(path.join(ROOT, 'manifest.src.json'), bump),
];
const stopWatching = () => {
  clearTimeout(timer);
  for (const watcher of watchers) watcher.close();
};

// web-ext wants an absolute, existing profile directory or it reads the value
// as a profile name. Whether it already existed is worth saying: a missing one
// looks identical at startup and only shows up as a GitHub login prompt.
const reusing = !fresh && existsSync(PROFILE);
if (!fresh) mkdirSync(PROFILE, { recursive: true });
console.log(`  ${target}`);
console.log(
  fresh
    ? '  throwaway profile'
    : reusing
      ? `  profile ${path.relative(ROOT, PROFILE)} (reusing)`
      : `  profile ${path.relative(ROOT, PROFILE)} (new)`
);
console.log(`  ${START_URL}`);

const profileArgs = fresh
  ? []
  : chrome
    ? ['--chromium-profile', PROFILE, '--keep-profile-changes']
    : ['--firefox-profile', PROFILE, '--keep-profile-changes', '--profile-create-if-missing'];

const child = spawn(
  process.execPath,
  [
    WEB_EXT,
    'run',
    '--source-dir',
    SOURCE,
    '--target',
    chrome ? 'chromium' : 'firefox-desktop',
    '--start-url',
    START_URL,
    ...profileArgs,
    ...passthrough,
  ],
  { cwd: ROOT, stdio: 'inherit' }
);

// The console delivers Ctrl-C to web-ext too, which shuts the browser down in
// order; its exit ends us. A second Ctrl-C means that did not happen.
let interrupts = 0;
process.on('SIGINT', () => {
  if ((interrupts += 1) > 1) {
    stopWatching();
    process.exit(130);
  }
});

child.on('exit', (code, signal) => {
  stopWatching();
  process.exit(code ?? (signal ? 1 : 0));
});
