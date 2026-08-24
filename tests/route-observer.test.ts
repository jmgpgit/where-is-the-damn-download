// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeRoutes, type RouteObserver } from '../src/content/route-observer';

describe('observeRoutes', () => {
  let observer: RouteObserver | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    observer?.stop();
    observer = undefined;
    vi.useRealTimers();
  });

  it('fires immediately with generation 1', () => {
    const calls: number[] = [];
    observer = observeRoutes((g) => calls.push(g), () => true);
    expect(calls).toEqual([1]);
  });

  it('fires again when a navigation event changes the URL', () => {
    const calls: number[] = [];
    observer = observeRoutes((g) => calls.push(g), () => true);

    history.pushState({}, '', '/other/page');
    window.dispatchEvent(new Event('popstate'));
    vi.advanceTimersByTime(300);

    expect(calls).toEqual([1, 2]);
  });

  it('does not refire when the URL is unchanged and UI is settled', () => {
    const calls: number[] = [];
    observer = observeRoutes((g) => calls.push(g), () => true);

    window.dispatchEvent(new Event('turbo:render'));
    window.dispatchEvent(new Event('turbo:render'));
    vi.advanceTimersByTime(300);

    expect(calls).toEqual([1]);
  });

  it('refires when the mounted UI disappears', () => {
    const calls: number[] = [];
    let mounted = true;
    observer = observeRoutes((g) => calls.push(g), () => mounted);

    mounted = false;
    window.dispatchEvent(new Event('turbo:render'));
    vi.advanceTimersByTime(300);

    expect(calls).toEqual([1, 2]);
  });

  it('debounces bursts into one callback', () => {
    const calls: number[] = [];
    let mounted = true;
    observer = observeRoutes((g) => calls.push(g), () => mounted);

    mounted = false;
    for (let i = 0; i < 10; i += 1) {
      window.dispatchEvent(new Event('turbo:render'));
      vi.advanceTimersByTime(50);
    }
    vi.advanceTimersByTime(300);

    expect(calls).toEqual([1, 2]);
  });

  it('stops firing after stop()', () => {
    const calls: number[] = [];
    observer = observeRoutes((g) => calls.push(g), () => true);
    observer.stop();

    history.pushState({}, '', '/elsewhere');
    window.dispatchEvent(new Event('popstate'));
    vi.advanceTimersByTime(300);

    expect(calls).toEqual([1]);
  });
});
