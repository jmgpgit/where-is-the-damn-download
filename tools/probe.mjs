#!/usr/bin/env node
/**
 * Classifies a repository's latest release for three common platforms, the
 * way the extension would, and optionally snapshots it as a real-world fixture.
 *
 *   npm run probe -- owner/repo [--save]
 *
 * The pure domain and the GitHub client are TypeScript, so they are bundled
 * into dist/ (gitignored) with esbuild and imported from there.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIR = path.join(ROOT, 'tests', 'fixtures', 'real-world');

const args = process.argv.slice(2);
const save = args.includes('--save');
const slug = args.find((a) => !a.startsWith('--'));
const match = /^([\w.-]+)\/([\w.-]+)$/.exec(slug ?? '');
if (match === null) {
  console.error('usage: npm run probe -- owner/repo [--save]');
  process.exit(2);
}
const [, owner, repo] = match;
const fullName = `${owner}/${repo}`;

const outfile = path.join(ROOT, 'dist', 'probe-domain.mjs');
await mkdir(path.dirname(outfile), { recursive: true });
await esbuild.build({
  stdin: {
    contents: "export { recommend } from './src/domain/recommend'; export { fetchLatestRelease } from './src/github/api-client';",
    resolveDir: ROOT,
    loader: 'ts',
  },
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'warning',
});
const { recommend, fetchLatestRelease } = await import(pathToFileURL(outfile).href);

async function saveFixture(fixture) {
  await mkdir(FIXTURE_DIR, { recursive: true });
  const file = path.join(FIXTURE_DIR, `${owner}--${repo}.json`);
  await writeFile(file, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`\nsaved ${path.relative(ROOT, file)}`);
}

const PREFS = { mode: 'simple', packagePreference: 'installer', releaseChannel: 'stable', showSourceWarnings: true };
const PLATFORMS = [['windows', 'x64'], ['macos', 'arm64'], ['linux', 'x64']];

function report(fixture) {
  const assets = fixture.assets.map((a, i) => ({
    assetId: i + 1,
    name: a.name,
    size: a.size,
    downloadCount: a.downloadCount,
    downloadUrl: `https://github.com/${fullName}/releases/download/${fixture.tag}/${a.name}`,
  }));
  console.log(`${fullName} ${fixture.tag}${fixture.prerelease ? ' (prerelease)' : ''} — ${assets.length} assets`);
  for (const [os, arch] of PLATFORMS) {
    const r = recommend(assets, { os, arch, detectedOs: os, detectedArch: arch, overridden: false }, PREFS);
    const p = r.primary;
    const head = p ? `${p.name} [${p.packageKind}, score ${p.score}, ${p.downloadCount} downloads]` : 'no primary';
    console.log(`\n${os}/${arch}: ${r.confidence.toUpperCase()} → ${head}`);
    for (const a of r.alternatives.slice(0, 3)) console.log(`    alt:  ${a.name} (${a.score})`);
    for (const e of p?.evidence.filter((e) => e.effect === 'informational') ?? []) console.log(`    note: ${e.explanation}`);
    for (const w of r.warnings) console.log(`    warn: ${w}`);
  }
}

// no process.exit() past this point: esbuild's service child must wind down on its own
const outcome = await fetchLatestRelease((url, init) => fetch(url, init), owner, repo);
if (outcome.kind === 'not-found') {
  console.log(`${fullName}: no releases`);
  if (save) await saveFixture({ repo: fullName, status: 'no-releases' });
} else if (outcome.kind !== 'ok') {
  console.error(`${fullName}: GitHub API ${outcome.kind}`);
  process.exitCode = 1;
} else {
  const release = outcome.json;
  const fixture = {
    repo: fullName,
    tag: release.tag_name,
    prerelease: Boolean(release.prerelease),
    assets: (release.assets ?? []).map((a) => ({ name: a.name, size: a.size, downloadCount: a.download_count })),
  };
  report(fixture);
  if (save) await saveFixture(fixture);
}
