/**
 * Renders the panel for every state the content script can be in. Pure DOM
 * construction; every piece of GitHub-derived text lands via textContent.
 * Simple mode shows one recommendation and plain language; advanced mode
 * exposes the classifier's evidence. No numerical scores in simple mode.
 */

import type { Recommendation, UserPlatform } from '../domain/asset-types';
import { explainCaveats, explainPrimary } from '../domain/explanations';
import type { ExtensionSettings, ReleaseInfo } from '../shared/messages';
import { renderAssetList, safeDownloadHref } from './asset-list';
import { renderSettingsControls } from './settings-controls';
import {
  DISCLAIMERS,
  HEADINGS,
  LABELS,
  PACKAGE_NAMES,
  STATES,
  describePlatform,
  formatCount,
  formatSize,
} from './strings';

export interface PanelHandlers {
  onSettingsChange(settings: ExtensionSettings): void;
  onRefresh(): void;
}

export type PanelView =
  | { kind: 'loading' }
  | {
      kind: 'status';
      heading: string;
      body: string;
      note?: string;
      /** Where to look next; shown as a short list under the body. */
      hints?: readonly string[];
      settings: ExtensionSettings;
      platform: UserPlatform;
    }
  | {
      kind: 'recommendation';
      settings: ExtensionSettings;
      platform: UserPlatform;
      release: ReleaseInfo;
      stale: boolean;
      viewingTag: boolean;
      recommendation: Recommendation;
      /** Shown only when nothing could be recommended. */
      hints?: readonly string[];
    };

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function disclosure(doc: Document, summaryText: string, content: Node): HTMLDetailsElement {
  const details = el(doc, 'details', 'wtd-details');
  details.append(el(doc, 'summary', undefined, summaryText), content);
  return details;
}

function hintList(doc: Document, hints: readonly string[]): HTMLUListElement {
  const ul = el(doc, 'ul', 'wtd-hints');
  for (const hint of hints) ul.append(el(doc, 'li', undefined, hint));
  return ul;
}

function footer(doc: Document): HTMLElement {
  const foot = el(doc, 'div', 'wtd-footer');
  foot.append(
    el(doc, 'div', undefined, DISCLAIMERS.compatibility),
    el(doc, 'div', undefined, DISCLAIMERS.affiliation)
  );
  return foot;
}

function controls(
  doc: Document,
  settings: ExtensionSettings,
  handlers: PanelHandlers
): HTMLElement {
  const row = renderSettingsControls(settings, handlers.onSettingsChange, doc);
  const refresh = el(doc, 'button', 'wtd-button', LABELS.refresh);
  refresh.type = 'button';
  refresh.addEventListener('click', () => handlers.onRefresh());
  row.append(refresh);
  return row;
}

function metaLine(
  doc: Document,
  platform: UserPlatform,
  release: ReleaseInfo,
  viewingTag: boolean
): HTMLElement {
  const meta = el(doc, 'div', 'wtd-meta');
  const platformLabel = platform.overridden
    ? `${describePlatform(platform.os, platform.arch)} (chosen by you)`
    : describePlatform(platform.os, platform.arch);
  // Wording follows the release, not the route: the prerelease channel can
  // surface an rc on the repo home, which must never read as "stable".
  const releaseWord = release.prerelease
    ? LABELS.latestPrerelease
    : viewingTag
      ? LABELS.release
      : LABELS.latestStable;
  meta.textContent = `${LABELS.detected}: ${platformLabel} · ${releaseWord}: ${release.tagName}`;
  return meta;
}

function positiveExplanations(recommendation: Recommendation): string[] {
  const primary = recommendation.primary;
  if (!primary) return [];
  return [explainPrimary(primary), ...explainCaveats(primary)];
}

function primaryBlock(
  doc: Document,
  recommendation: Recommendation,
  showButton: boolean
): HTMLElement {
  const primary = recommendation.primary;
  const block = el(doc, 'div', 'wtd-primary');
  if (!primary) return block;

  block.append(el(doc, 'div', 'wtd-filename', primary.name));

  const descParts = [PACKAGE_NAMES[primary.packageKind]];
  const size = formatSize(primary.size);
  if (size) descParts.push(size);
  descParts.push(`${formatCount(primary.downloadCount)} ${LABELS.downloads}`);
  block.append(el(doc, 'div', 'wtd-filedesc', descParts.join(' · ')));

  const href = safeDownloadHref(primary.downloadUrl);
  if (href && showButton) {
    const link = el(doc, 'a', 'wtd-download', LABELS.download);
    link.href = href;
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${LABELS.download} ${primary.name}`);
    block.append(link);
  }
  return block;
}

function choiceList(doc: Document, recommendation: Recommendation): HTMLElement {
  const wrap = el(doc, 'div');
  const choices = [
    ...(recommendation.primary ? [recommendation.primary] : []),
    ...recommendation.alternatives,
  ].slice(0, 4);
  for (const asset of choices) {
    const href = safeDownloadHref(asset.downloadUrl);
    const meta = `${PACKAGE_NAMES[asset.packageKind]} · ${formatSize(asset.size)}`;
    if (href) {
      const link = el(doc, 'a', 'wtd-choice');
      link.href = href;
      link.rel = 'noopener noreferrer';
      link.append(el(doc, 'div', 'wtd-filename', asset.name), el(doc, 'div', 'wtd-muted', meta));
      wrap.append(link);
    } else {
      const row = el(doc, 'div', 'wtd-choice');
      row.append(el(doc, 'div', 'wtd-filename', asset.name), el(doc, 'div', 'wtd-muted', meta));
      wrap.append(row);
    }
  }
  return wrap;
}

function renderRecommendation(
  doc: Document,
  view: Extract<PanelView, { kind: 'recommendation' }>,
  handlers: PanelHandlers
): DocumentFragment {
  const { recommendation, settings, platform, release, stale, viewingTag } = view;
  const advanced = settings.mode === 'advanced';
  const fragment = doc.createDocumentFragment();

  fragment.append(el(doc, 'h2', 'wtd-heading', HEADINGS[recommendation.confidence]));
  fragment.append(metaLine(doc, platform, release, viewingTag));

  if (release.prerelease) {
    fragment.append(el(doc, 'div', 'wtd-warning', STATES.prereleaseNotice));
  }
  if (stale) {
    fragment.append(el(doc, 'div', 'wtd-note', STATES.stale));
  }

  const confidence = recommendation.confidence;
  if (confidence === 'high' || confidence === 'medium') {
    if (recommendation.summary) {
      fragment.append(el(doc, 'div', 'wtd-state', recommendation.summary));
    }
    fragment.append(primaryBlock(doc, recommendation, true));
  } else if (confidence === 'low') {
    fragment.append(el(doc, 'div', 'wtd-state', recommendation.summary));
    fragment.append(choiceList(doc, recommendation));
  } else {
    fragment.append(el(doc, 'div', 'wtd-state', recommendation.summary || STATES.noCompatible));
    if (view.hints?.length) fragment.append(hintList(doc, view.hints));
  }

  for (const warning of recommendation.warnings) {
    fragment.append(el(doc, 'div', 'wtd-warning', warning));
  }

  if (recommendation.primary && (confidence === 'high' || confidence === 'medium')) {
    const why = doc.createElement('ul');
    why.className = 'wtd-evidence';
    for (const sentence of positiveExplanations(recommendation)) {
      why.append(el(doc, 'li', undefined, sentence));
    }
    if (why.childElementCount > 0) {
      fragment.append(disclosure(doc, LABELS.whyThisFile, why));
    }
  }

  const total =
    (recommendation.primary ? 1 : 0) +
    recommendation.alternatives.length +
    recommendation.excluded.length;
  if (total > 0) {
    const list = renderAssetList(recommendation, advanced, doc);
    const label = confidence === 'low' ? LABELS.reviewChoices : LABELS.otherDownloads;
    const details = disclosure(doc, `${label} (${total})`, list);
    if (advanced) details.open = true;
    fragment.append(details);
  }

  fragment.append(controls(doc, settings, handlers), footer(doc));
  return fragment;
}

export function renderPanel(
  container: HTMLElement,
  view: PanelView,
  handlers: PanelHandlers
): void {
  const doc = container.ownerDocument;
  container.setAttribute('aria-live', 'polite');
  container.replaceChildren();

  if (view.kind === 'loading') {
    container.append(el(doc, 'div', 'wtd-state', STATES.loading));
    return;
  }

  if (view.kind === 'status') {
    container.append(el(doc, 'h2', 'wtd-heading', view.heading));
    container.append(el(doc, 'div', 'wtd-state', view.body));
    if (view.note) container.append(el(doc, 'div', 'wtd-note', view.note));
    if (view.hints?.length) container.append(hintList(doc, view.hints));
    container.append(controls(doc, view.settings, handlers), footer(doc));
    return;
  }

  container.append(renderRecommendation(doc, view, handlers));
}
