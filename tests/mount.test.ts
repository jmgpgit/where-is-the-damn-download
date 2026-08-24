// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { findAnchor, findExistingMount, mountPanel, unmountPanel } from '../src/content/mount';
import { MOUNT_ATTR } from '../src/ui/strings';

describe('mountPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts once under the repo turbo-frame', () => {
    document.body.innerHTML =
      '<turbo-frame id="repo-content-turbo-frame"><div id="readme"></div></turbo-frame>';
    const mounted = mountPanel('/o/r');
    expect(mounted).not.toBeNull();
    const host = findExistingMount();
    expect(host?.getAttribute(MOUNT_ATTR)).toBe('/o/r');
    expect(host?.parentElement?.id).toBe('repo-content-turbo-frame');
    expect(host?.previousElementSibling).toBeNull(); // first child
    expect(mounted?.container.className).toBe('wtd-panel');
  });

  it('is idempotent for the same route', () => {
    document.body.innerHTML = '<main></main>';
    const first = mountPanel('/o/r');
    const second = mountPanel('/o/r');
    expect(second?.host).toBe(first?.host);
    expect(document.querySelectorAll(`[${MOUNT_ATTR}]`)).toHaveLength(1);
  });

  it('replaces the mount when the route changes', () => {
    document.body.innerHTML = '<main></main>';
    const first = mountPanel('/o/r');
    const second = mountPanel('/o/other');
    expect(second?.host).not.toBe(first?.host);
    expect(document.querySelectorAll(`[${MOUNT_ATTR}]`)).toHaveLength(1);
    expect(findExistingMount()?.getAttribute(MOUNT_ATTR)).toBe('/o/other');
  });

  it('falls back to <main> and to nothing', () => {
    document.body.innerHTML = '<main id="m"></main>';
    expect(findAnchor()?.id).toBe('m');
    expect(mountPanel('/o/r')).not.toBeNull();

    document.body.innerHTML = '<div>no anchors here</div>';
    expect(findAnchor()).toBeNull();
    expect(mountPanel('/o/r')).toBeNull();
    expect(findExistingMount()).toBeNull();
  });

  it('unmounts cleanly', () => {
    document.body.innerHTML = '<main></main>';
    mountPanel('/o/r');
    unmountPanel();
    expect(findExistingMount()).toBeNull();
  });

  it('uses a shadow root so page styles cannot reach in', () => {
    document.body.innerHTML = '<main></main>';
    const mounted = mountPanel('/o/r');
    expect(mounted?.host.shadowRoot).not.toBeNull();
    expect(mounted?.host.shadowRoot?.querySelector('style')).not.toBeNull();
  });
});
