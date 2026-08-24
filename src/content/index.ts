/**
 * Content-script boot: route lifecycle, state requests, classification and
 * rendering. The classifier runs here (it is pure and instant), so settings
 * tweaks in the panel re-rank without another network round trip.
 */

import type { AssetInput, UserPreferences } from '../domain/asset-types';
import { recommend } from '../domain/recommend';
import { ext } from '../shared/browser-api';
import { debug } from '../shared/logging';
import type {
  BackgroundResponse,
  ExtensionSettings,
  ReleaseInfo,
  ReleaseSelector,
  StateResponse,
} from '../shared/messages';
import { renderPanel, type PanelHandlers, type PanelView } from '../ui/recommendation-card';
import { HEADINGS, STATES } from '../ui/strings';
import { getPageContext } from './github-context';
import { findExistingMount, mountPanel, unmountPanel } from './mount';
import { observeRoutes } from './route-observer';
import { annotateSourceArchives } from './source-archive-annotation';
import type { GitHubPageContext } from '../github/url-parser';

type RepoContext = Exclude<GitHubPageContext, { kind: 'unsupported' }>;

/** What the observer restores: same route, and the panel (when owed) present. */
let settled = { route: '', mounted: false };

function isSettled(): boolean {
  if (settled.route !== location.pathname) return false;
  if (!settled.mounted) return true;
  return findExistingMount()?.isConnected === true;
}

function selectorFor(context: RepoContext): ReleaseSelector {
  return context.kind === 'release-tag'
    ? { kind: 'tag', tag: context.tag }
    : { kind: 'latest' };
}

async function requestState(
  context: RepoContext,
  forceRefresh: boolean
): Promise<StateResponse | null> {
  try {
    const response = (await ext.runtime.sendMessage({
      type: 'get-state',
      owner: context.owner,
      repo: context.repo,
      selector: selectorFor(context),
      forceRefresh,
    })) as BackgroundResponse | undefined;
    return response?.type === 'state' ? response.state : null;
  } catch (error) {
    debug('get-state failed', error);
    return null;
  }
}

function toAssetInputs(release: ReleaseInfo): AssetInput[] {
  return release.assets.map((asset) => ({
    assetId: asset.id,
    name: asset.name,
    label: asset.label,
    size: asset.size,
    downloadCount: asset.downloadCount,
    downloadUrl: asset.browserDownloadUrl,
  }));
}

function preferencesFrom(settings: ExtensionSettings): UserPreferences {
  return {
    mode: settings.mode,
    packagePreference: settings.packagePreference,
    releaseChannel: settings.releaseChannel,
    showSourceWarnings: settings.showSourceWarnings,
  };
}

function buildView(context: RepoContext, state: StateResponse): PanelView {
  const { release, settings, platform } = state;
  const status = (heading: string, body: string, note?: string): PanelView =>
    note
      ? { kind: 'status', heading, body, note, settings, platform }
      : { kind: 'status', heading, body, settings, platform };

  switch (release.status) {
    case 'ok': {
      // GitHub's generated source archives are not assets; an empty list
      // means the release offers nothing but those.
      if (release.release.assets.length === 0) {
        return status(HEADINGS.none, STATES.onlySource);
      }
      const recommendation = recommend(
        toAssetInputs(release.release),
        platform,
        preferencesFrom(settings)
      );
      return {
        kind: 'recommendation',
        settings,
        platform,
        release: release.release,
        stale: release.stale,
        viewingTag: context.kind === 'release-tag',
        recommendation,
      };
    }
    case 'no-releases':
      return context.kind === 'release-tag'
        ? status(HEADINGS.none, STATES.releaseNotFound)
        : status(STATES.noReleasesTitle, STATES.noReleases);
    case 'no-stable-release':
      return status(
        HEADINGS.none,
        release.prereleaseAvailable ? STATES.noStableButPrerelease : STATES.noStableRelease
      );
    case 'repo-not-found':
      return status(HEADINGS.none, STATES.repoNotFound);
    case 'rate-limited':
      return status(HEADINGS.none, STATES.rateLimited);
    case 'network-error':
      return status(HEADINGS.none, STATES.networkError);
    case 'github-error':
      return status(HEADINGS.none, STATES.githubError);
    case 'invalid-response':
      return status(HEADINGS.none, STATES.invalidResponse);
  }
}

async function run(generation: number, current: () => number, forceRefresh = false): Promise<void> {
  const context = getPageContext();
  const route = location.pathname;

  if (context.kind === 'unsupported') {
    unmountPanel();
    settled = { route, mounted: false };
    return;
  }

  const state = await requestState(context, forceRefresh);
  if (current() !== generation) return; // navigated away while waiting
  if (!state) {
    settled = { route, mounted: findExistingMount() !== null };
    return;
  }

  const { settings } = state;
  const onHome = context.kind === 'repository-home';
  const wanted =
    settings.enabled && (onHome ? settings.showOnRepositoryHome : settings.showOnReleasePages);
  if (!wanted) {
    unmountPanel();
    settled = { route, mounted: false };
    return;
  }

  const mounted = mountPanel(route);
  if (!mounted) {
    settled = { route, mounted: false };
    return;
  }

  const handlers: PanelHandlers = {
    onSettingsChange(next) {
      void saveSettingsAndRerun(next, current);
    },
    onRefresh() {
      void run(current(), current, true);
    },
  };

  renderPanel(mounted.container, buildView(context, state), handlers);
  settled = { route, mounted: true };

  if (!onHome && settings.showSourceWarnings && state.release.status === 'ok') {
    annotateSourceArchives(context.owner, context.repo);
  }
}

async function saveSettingsAndRerun(
  settings: ExtensionSettings,
  current: () => number
): Promise<void> {
  try {
    await ext.runtime.sendMessage({ type: 'save-settings', settings });
  } catch (error) {
    debug('save-settings failed', error);
  }
  void run(current(), current);
}

// The first callback fires synchronously inside observeRoutes, so the
// generation is tracked in a local rather than via the returned handle.
let latestGeneration = 0;
observeRoutes((generation) => {
  latestGeneration = generation;
  void run(generation, () => latestGeneration);
}, isSettled);
