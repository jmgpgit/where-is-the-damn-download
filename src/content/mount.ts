/**
 * Idempotent Shadow-DOM mount. All GitHub selector knowledge for panel
 * placement lives here, as a prioritized list of anchors; if none matches we
 * do nothing rather than obstruct the page.
 */

import { MOUNT_ATTR } from '../ui/strings';
import { PANEL_CSS } from '../ui/styles';

export interface Mounted {
  host: HTMLElement;
  /** Render target inside the shadow root. */
  container: HTMLElement;
}

/**
 * Anchors, most specific first. The repo home and release pages both render
 * inside the repo content turbo-frame; <main> is the resilience fallback.
 */
const ANCHOR_SELECTORS = ['turbo-frame#repo-content-turbo-frame', 'main'];

export function findAnchor(root: ParentNode = document): Element | null {
  for (const selector of ANCHOR_SELECTORS) {
    const el = root.querySelector(selector);
    if (el) return el;
  }
  return null;
}

export function findExistingMount(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[${MOUNT_ATTR}]`);
}

/**
 * Mount exactly one panel host as the anchor's first child. Safe to call
 * repeatedly: an existing connected host is reused; a detached one is
 * replaced. Returns null when no safe insertion point exists.
 */
export function mountPanel(routeKey: string, root: ParentNode = document): Mounted | null {
  const existing = findExistingMount(root);
  if (existing?.isConnected && existing.getAttribute(MOUNT_ATTR) === routeKey) {
    const container = existing.shadowRoot?.querySelector<HTMLElement>('.wtd-panel');
    if (container) return { host: existing, container };
  }
  existing?.remove();

  const anchor = findAnchor(root);
  if (!anchor) return null;

  const host = document.createElement('div');
  host.setAttribute(MOUNT_ATTR, routeKey);
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  shadow.append(style);

  const container = document.createElement('section');
  container.className = 'wtd-panel';
  shadow.append(container);

  anchor.prepend(host);
  return { host, container };
}

export function unmountPanel(root: ParentNode = document): void {
  findExistingMount(root)?.remove();
}
