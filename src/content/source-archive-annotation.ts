/**
 * Adds a restrained note beside GitHub-generated source archives on release
 * pages. Identification is by URL structure only (/archive/refs/tags/...);
 * when in doubt we annotate nothing. Links are never moved, hidden or
 * rewritten.
 */

import { BADGE_CLASS } from '../ui/styles';
import { LABELS } from '../ui/strings';

const ANNOTATED = 'data-wtd-source-note';

export function annotateSourceArchives(
  owner: string,
  repo: string,
  doc: Document = document
): number {
  const prefix = `/${owner}/${repo}/archive/refs/tags/`.toLowerCase();
  let annotated = 0;

  for (const link of doc.querySelectorAll<HTMLAnchorElement>('a[href*="/archive/refs/tags/"]')) {
    if (link.hasAttribute(ANNOTATED)) continue;
    let url: URL;
    try {
      url = new URL(link.href, doc.location.href);
    } catch {
      continue;
    }
    if (url.origin !== 'https://github.com') continue;
    if (!url.pathname.toLowerCase().startsWith(prefix)) continue;

    link.setAttribute(ANNOTATED, 'true');
    const badge = doc.createElement('span');
    badge.className = BADGE_CLASS;
    badge.textContent = LABELS.sourceBadge;
    badge.style.display = 'block';
    badge.style.fontSize = '12px';
    badge.style.color = 'var(--fgColor-muted, #59636e)';
    link.insertAdjacentElement('afterend', badge);
    annotated += 1;
  }
  return annotated;
}
