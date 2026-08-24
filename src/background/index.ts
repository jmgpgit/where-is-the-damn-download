/**
 * Background entry: the message router. Listeners register synchronously at
 * top level — Chrome's service worker restarts from nothing and event pages
 * expect the same.
 */

import { ext } from '../shared/browser-api';
import {
  isValidSettings,
  parseBackgroundRequest,
  type BackgroundRequest,
  type BackgroundResponse,
  type StateResponse,
} from '../shared/messages';
import { loadSettings, saveSettings } from '../storage/settings';
import { normalizePlatform, resolvePlatform } from '../platform/normalize-platform';
import { getRelease } from './release-service';
import { debug } from '../shared/logging';

ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only our own extension's pages and content scripts; web pages cannot
  // reach here without externally_connectable, other extensions are refused.
  if (sender.id !== ext.runtime.id) return false;

  const request = parseBackgroundRequest(message);
  if (!request) {
    sendResponse({ type: 'bad-request' } satisfies BackgroundResponse);
    return false;
  }

  handle(request).then(sendResponse, (error: unknown) => {
    debug('background handler failed', error);
    sendResponse({ type: 'bad-request' } satisfies BackgroundResponse);
  });
  return true;
});

ext.action.onClicked.addListener(() => {
  void ext.runtime.openOptionsPage();
});

async function handle(request: BackgroundRequest): Promise<BackgroundResponse> {
  if (request.type === 'save-settings') {
    // Merge onto what is stored now, not onto the sender's snapshot.
    const merged = { ...(await loadSettings(ext.storage.sync)), ...request.patch };
    if (!isValidSettings(merged)) return { type: 'bad-request' };
    await saveSettings(ext.storage.sync, merged);
    return { type: 'settings-saved', settings: merged };
  }

  const settings = await loadSettings(ext.storage.sync);
  const wanted =
    settings.enabled &&
    (request.surface === 'home' ? settings.showOnRepositoryHome : settings.showOnReleasePages);
  // No panel means no API request: a switched-off extension must not spend
  // the unauthenticated quota.
  if (!wanted) return { type: 'disabled', settings };

  const info = await ext.runtime.getPlatformInfo();
  const platform = resolvePlatform(normalizePlatform(info), settings);

  // The channel setting upgrades plain "latest" requests; the content script
  // does not need to know settings before asking.
  let selector = request.selector;
  if (selector.kind === 'latest' && settings.releaseChannel === 'include-prerelease') {
    selector = { kind: 'latest-including-prerelease' };
  }

  const release = await getRelease(
    { fetchImpl: (url, init) => fetch(url, init), area: ext.storage.local, now: () => Date.now() },
    request.owner,
    request.repo,
    selector,
    request.forceRefresh ?? false
  );

  const state: StateResponse = { settings, platform, release };
  return { type: 'state', state };
}
