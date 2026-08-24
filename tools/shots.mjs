#!/usr/bin/env node
/**
 * Capture store screenshots from a real browser with the extension loaded.
 *
 *   node tools/shots.mjs            capture docs/screenshot-*.png
 *   node tools/shots.mjs --keep     leave the browser open afterwards
 *
 * Firefox, driven over WebDriver BiDi, because Chrome will not cooperate:
 * since Chrome 137 `--load-extension` is ignored whenever the browser is
 * started for remote debugging, and Chrome 151 also refuses unpacked
 * extensions unless Developer mode is on, which cannot be seeded into a fresh
 * profile. The symptom is silent — chrome://extensions is simply empty, the
 * content script never runs, and nothing is logged. Firefox's BiDi
 * `webExtension.install` is a supported entry point and does not fight back.
 *
 * The viewport is set with browsingContext.setViewport rather than a window
 * size: `--window-size` sizes the OUTER window, so a 1280x800 window screenshots
 * at 1264x792 once the browser chrome is subtracted. The stores want the image.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist', 'firefox');
const DOCS = path.join(ROOT, 'docs');
const PROFILE = path.join(ROOT, '.dev-profile', 'shots');
const PORT = 9334;

const WIDTH = 1280;
const HEIGHT = 800;

const FIREFOX = [
  'C:/Program Files/Mozilla Firefox/firefox.exe',
  'C:/Program Files (x86)/Mozilla Firefox/firefox.exe',
  `${process.env.LOCALAPPDATA}/Mozilla Firefox/firefox.exe`,
  '/usr/bin/firefox',
].find((p) => existsSync(p));

/** Each shot: where to go, whether to open the disclosure, what to call it. */
const SHOTS = [
  {
    file: 'screenshot-recommendation.png',
    url: 'https://github.com/ShareX/ShareX',
    note: 'high-confidence recommendation on a repository home page',
  },
  {
    file: 'screenshot-other-downloads.png',
    url: 'https://github.com/PowerShell/PowerShell',
    open: true,
    note: 'the full asset list, every file with its own reason',
  },
  {
    file: 'screenshot-no-releases.png',
    url: 'https://github.com/python/cpython',
    note: 'an honest empty state',
  },
  {
    file: 'screenshot-release-page.png',
    url: 'https://github.com/microsoft/PowerToys/releases/latest',
    note: 'a release page, with the source-archive note',
  },
];

if (!FIREFOX) throw new Error('No Firefox found. Edit FIREFOX in tools/shots.mjs.');
if (!existsSync(DIST)) throw new Error('dist/firefox is missing. Run `npm run build` first.');
mkdirSync(DOCS, { recursive: true });
mkdirSync(PROFILE, { recursive: true });

// A fresh profile otherwise stops on the first-run and data-notice screens,
// which never finish loading and so never reach the page under test.
writeFileSync(
  path.join(PROFILE, 'user.js'),
  [
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
    'user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);',
    'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
    'user_pref("browser.aboutwelcome.enabled", false);',
    'user_pref("remote.prefs.recommended", true);',
    'user_pref("xpinstall.signatures.required", false);',
  ].join('\n')
);

const child = spawn(
  FIREFOX,
  [
    '--remote-debugging-port',
    String(PORT),
    '--profile',
    PROFILE,
    '--no-remote',
    '--new-instance',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Firefox dropped its CDP endpoint, so there is no /json/version to ask: BiDi
 * lives at /session and the only way to know it is up is to connect.
 */
async function connect() {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}/session`);
    const opened = await new Promise((resolve) => {
      socket.addEventListener('open', () => resolve(true), { once: true });
      socket.addEventListener('error', () => resolve(false), { once: true });
    });
    if (opened) return socket;
    await sleep(500);
  }
  throw new Error('Firefox did not open its remote-debugging port');
}

const ws = await connect();

let nextId = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.type === 'error') reject(new Error(`${message.error}: ${message.message}`));
    else resolve(message.result);
  }
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send('session.new', { capabilities: {} });

const { extension } = await send('webExtension.install', {
  extensionData: { type: 'path', path: DIST, moduleUrl: null },
});
console.log(`  extension installed (${extension})`);

const { contexts } = await send('browsingContext.getTree', {});
const context = contexts[0].context;
await send('browsingContext.setViewport', {
  context,
  viewport: { width: WIDTH, height: HEIGHT },
  devicePixelRatio: 1,
});

/** Poll inside the page until the panel has mounted and rendered a heading. */
async function waitForPanel() {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const result = await send('script.evaluate', {
      expression: `(() => {
        const host = document.querySelector('[data-wheres-the-download-root]');
        if (!host || !host.shadowRoot) return null;
        const panel = host.shadowRoot.querySelector('.wtd-panel');
        const heading = panel && panel.querySelector('.wtd-heading');
        if (!heading || !heading.textContent) return null;
        const file = panel.querySelector('.wtd-filename');
        return heading.textContent + (file ? ' | ' + file.textContent : '');
      })()`,
      target: { context },
      awaitPromise: true,
    });
    if (result.result?.type === 'string') return result.result.value;
    await sleep(400);
  }
  return null;
}

/** The asset list, not the "Why this file?" disclosure that precedes it. */
async function openDisclosure() {
  await send('script.evaluate', {
    expression: `(() => {
      const host = document.querySelector('[data-wheres-the-download-root]');
      if (!host) return false;
      const all = [...host.shadowRoot.querySelectorAll('details')];
      const list = all.find((d) => d.querySelector('.wtd-list')) || all[all.length - 1];
      if (list) list.open = true;
      return !!list;
    })()`,
    target: { context },
    awaitPromise: true,
  });
  await sleep(400);
}

for (const shot of SHOTS) {
  await send('browsingContext.navigate', { context, url: shot.url, wait: 'complete' });
  await sleep(2500);
  const panel = await waitForPanel();
  if (shot.open) await openDisclosure();
  await sleep(600);
  const { data } = await send('browsingContext.captureScreenshot', {
    context,
    origin: 'viewport',
  });
  const png = Buffer.from(data, 'base64');
  const out = path.join(DOCS, shot.file);
  writeFileSync(out, png);
  console.log(
    `  ${path.relative(ROOT, out)}  ${png.readUInt32BE(16)}x${png.readUInt32BE(20)}  ` +
      `${png.length} bytes  [${panel ?? 'NO PANEL'}]`
  );
}

if (!process.argv.includes('--keep')) {
  await send('browser.close', {}).catch(() => {});
  child.kill();
}
process.exit(0);
