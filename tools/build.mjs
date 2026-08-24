#!/usr/bin/env node
/**
 * Emits dist/firefox/ and dist/chrome/ from the TypeScript source.
 *
 * The checked-in manifest.src.json is the *Firefox* manifest, deliberately:
 * Firefox MV3 still uses background.scripts event pages, and AMO wants
 * browser_specific_settings. Chrome's differences are mechanical, so they are
 * applied here rather than maintained as a second manifest that would drift:
 *
 *   - background.scripts -> background.service_worker
 *   - browser_specific_settings dropped (Gecko-only; Chrome warns on it)
 *
 * `--dev` builds with inline sourcemaps and __DEV__ = true, which turns on
 * diagnostic logging (src/shared/logging.ts). Production builds define
 * __DEV__ = false and stay unminified so store reviewers read what we wrote.
 */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const DEV = process.argv.includes('--dev');

const ENTRIES = [
  { in: 'src/background/index.ts', out: 'background.js' },
  { in: 'src/content/index.ts', out: 'content.js' },
  { in: 'src/options/index.ts', out: 'options/options.js' },
];

/** @param {object} manifest the Firefox manifest, already parsed */
function toChrome(manifest) {
  const next = structuredClone(manifest);
  delete next.browser_specific_settings;
  const scripts = manifest.background?.scripts ?? [];
  if (scripts.length !== 1) {
    throw new Error(
      `manifest.background.scripts must contain exactly one script; found ${scripts.length}`
    );
  }
  next.background = { service_worker: scripts[0] };
  return next;
}

async function emit(target, manifest) {
  const out = path.join(DIST, target);
  await rm(out, { recursive: true, force: true });
  await mkdir(path.join(out, 'options'), { recursive: true });

  for (const entry of ENTRIES) {
    await esbuild.build({
      entryPoints: [path.join(ROOT, entry.in)],
      outfile: path.join(out, entry.out),
      bundle: true,
      format: 'iife',
      target: 'es2022',
      sourcemap: DEV ? 'inline' : false,
      define: { __DEV__: String(DEV) },
      logLevel: 'warning',
    });
  }

  await cp(path.join(ROOT, 'icons'), path.join(out, 'icons'), { recursive: true });
  await cp(path.join(ROOT, 'src/options/index.html'), path.join(out, 'options/index.html'));
  await writeFile(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`  dist/${target}`);
}

const firefox = JSON.parse(await readFile(path.join(ROOT, 'manifest.src.json'), 'utf8'));

if (firefox.background?.service_worker) {
  throw new Error(
    'manifest.src.json must stay Firefox-first. Remove background.service_worker: ' +
      'this script adds it for the Chrome build.'
  );
}

console.log(`Building ${firefox.name} ${firefox.version}${DEV ? ' (dev)' : ''}`);
await emit('firefox', firefox);
await emit('chrome', toChrome(firefox));
