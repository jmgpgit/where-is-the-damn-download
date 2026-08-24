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
  PanelSurface,
  ReleaseInfo,
  ReleaseSelector,
  StateResponse,
} from '../shared/messages';
import { renderPanel, type PanelHandlers, type PanelView } from '../ui/recommendation-card';
import { HEADINGS, MOUNT_ATTR, STATES } from '../ui/strings';
import { getPageContext } from './github-context';
import { findExistingMount, mountPanel, unmountPanel } from './mount';
import { observeRoutes } from './route-observer';
import { annotateSourceArchives } from './source-archive-annotation';
import type { GitHubPageContext } from '../github/url-parser';

type RepoContext = Exclude<GitHubPageContext, { kind: 'unsupported' }>;

/** What the observer restores: same route, and the panel (when owed) present. */
let settled = { route: '', mounted: false };
/** Source-archive notes owed on this route; re-applied as GitHub lazy-loads assets. */
let annotationOwed: { owner: string; repo: string } | null = null;

function isSettled(): boolean {
  if (settled.route !== location.pathname) return false;
  if (!settled.mounted) return true;
  return findExistingMount()?.isConnected === true;
}

function annotateIfOwed(): void {
  if (annotationOwed && settled.route === location.pathname) {
    annotateSourceArchives(annotationOwed.owner, annotationOwed.repo);
  }
}

function selectorFor(context: RepoContext): ReleaseSelector {
  return context.kind === 'release-tag'
    ? { kind: 'tag', tag: context.tag }
    : { kind: 'latest' };
}

function surfaceFor(context: RepoContext): PanelSurface {
  return context.kind === 'repository-home' ? 'home' : 'release';
}

type StateReply = StateResponse | 'disabled' | null;

async function requestState(context: RepoContext, forceRefresh: boolean): Promise<StateReply> {
  try {
    const response = (await ext.runtime.sendMessage({
      type: 'get-state',
      owner: context.owner,
      repo: context.repo,
      selector: selectorFor(context),
      surface: surfaceFor(context),
      forceRefresh,
    })) as BackgroundResponse | undefined;
    if (response?.type === 'state') return response.state;
    if (response?.type === 'disabled') return 'disabled';
    return null;
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

/** Only the fields the user changed, so a save cannot clobber another surface's edits. */
function settingsPatch(
  before: ExtensionSettings,
  after: ExtensionSettings
): Partial<ExtensionSettings> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof ExtensionSettings)[]) {
    if (before[key] !== after[key]) patch[key] = after[key];
  }
  return patch as Partial<ExtensionSettings>;
}

async function run(generation: number, current: () => number, forceRefresh = false): Promise<void> {
  const context = getPageContext();
  const route = location.pathname;
  annotationOwed = null;

  if (context.kind === 'unsupported') {
    unmountPanel();
    settled = { route, mounted: false };
    return;
  }

  const state = await requestState(context, forceRefresh);
  if (current() !== generation) return; // navigated away while waiting

  if (state === null) {
    // Keep a panel that already belongs to this route; drop one left behind
    // by the previous route rather than show the wrong repository's answer.
    const existing = findExistingMount();
    if (existing && existing.getAttribute(MOUNT_ATTR) !== route) unmountPanel();
    settled = { route, mounted: findExistingMount() !== null };
    return;
  }

  if (state === 'disabled') {
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
      void saveSettingsAndRerun(settingsPatch(state.settings, next), current);
    },
    onRefresh() {
      void run(current(), current, true);
    },
  };

  renderPanel(mounted.container, buildView(context, state), handlers);
  settled = { route, mounted: true };

  if (
    context.kind !== 'repository-home' &&
    state.settings.showSourceWarnings &&
    state.release.status === 'ok'
  ) {
    annotationOwed = { owner: context.owner, repo: context.repo };
    annotateIfOwed();
  }
}

async function saveSettingsAndRerun(
  patch: Partial<ExtensionSettings>,
  current: () => number
): Promise<void> {
  if (Object.keys(patch).length > 0) {
    try {
      await ext.runtime.sendMessage({ type: 'save-settings', patch });
    } catch (error) {
      debug('save-settings failed', error);
    }
  }
  void run(current(), current);
}

// The first callback fires synchronously inside observeRoutes, so the
// generation is tracked in a local rather than via the returned handle.
let latestGeneration = 0;
observeRoutes(
  (generation) => {
    latestGeneration = generation;
    void run(generation, () => latestGeneration);
  },
  isSettled,
  annotateIfOwed
);
