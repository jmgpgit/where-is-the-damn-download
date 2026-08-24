/**
 * The "Other downloads" list: every asset the release carries, eligible ones
 * as links, excluded ones muted with the reason. Advanced mode adds scores
 * and rule evidence. All dynamic text goes through textContent.
 */

import type { ClassifiedAsset, Recommendation } from '../domain/asset-types';
import { LABELS, PACKAGE_NAMES, formatCount, formatSize } from './strings';

/**
 * Defense in depth: only https github.com release-download URLs become
 * anchors, even though api-validation already guarantees this.
 */
export function safeDownloadHref(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.hostname !== 'github.com') return null;
  if (!url.pathname.includes('/releases/download/')) return null;
  return url.href;
}

function metaText(asset: ClassifiedAsset): string {
  const parts = [PACKAGE_NAMES[asset.packageKind]];
  const size = formatSize(asset.size);
  if (size) parts.push(size);
  parts.push(`${formatCount(asset.downloadCount)} ${LABELS.downloads}`);
  return parts.join(' · ');
}

function evidenceList(asset: ClassifiedAsset, doc: Document): HTMLUListElement {
  const ul = doc.createElement('ul');
  ul.className = 'wtd-evidence';
  for (const item of asset.evidence) {
    const li = doc.createElement('li');
    li.textContent = item.explanation;
    ul.append(li);
  }
  return ul;
}

function assetItem(
  asset: ClassifiedAsset,
  opts: { recommended: boolean; advanced: boolean },
  doc: Document
): HTMLLIElement {
  const li = doc.createElement('li');
  const line = doc.createElement('div');
  line.className = 'wtd-asset-line';

  const href = asset.eligible ? safeDownloadHref(asset.downloadUrl) : null;
  if (href) {
    const link = doc.createElement('a');
    link.className = 'wtd-asset-link';
    link.href = href;
    link.rel = 'noopener noreferrer';
    link.textContent = asset.name;
    line.append(link);
  } else {
    const name = doc.createElement('span');
    name.className = 'wtd-asset-link';
    name.textContent = asset.name;
    line.append(name);
  }

  if (opts.recommended) {
    const mark = doc.createElement('span');
    mark.className = 'wtd-badge';
    mark.textContent = LABELS.recommendedBadge;
    line.append(mark);
  }

  const meta = doc.createElement('span');
  meta.className = 'wtd-muted';
  meta.textContent = metaText(asset);
  line.append(meta);
  li.append(line);

  if (!asset.eligible) {
    li.className = 'wtd-excluded';
    const reason = asset.evidence.find((e) => e.effect === 'exclude')?.explanation;
    if (reason && !opts.advanced) {
      const note = doc.createElement('div');
      note.className = 'wtd-muted';
      note.textContent = reason;
      li.append(note);
    }
  }

  if (opts.advanced) {
    const score = doc.createElement('div');
    score.className = 'wtd-muted';
    score.textContent = asset.eligible ? `${LABELS.score}: ${asset.score}` : LABELS.excluded;
    li.append(score, evidenceList(asset, doc));
  }

  return li;
}

export function renderAssetList(
  recommendation: Recommendation,
  advanced: boolean,
  doc: Document = document
): HTMLUListElement {
  const ul = doc.createElement('ul');
  ul.className = 'wtd-list';

  const eligible: ClassifiedAsset[] = [];
  if (recommendation.primary) eligible.push(recommendation.primary);
  eligible.push(...recommendation.alternatives);

  for (const asset of eligible) {
    ul.append(assetItem(asset, { recommended: asset === recommendation.primary, advanced }, doc));
  }
  for (const asset of recommendation.excluded) {
    ul.append(assetItem(asset, { recommended: false, advanced }, doc));
  }
  return ul;
}
