/**
 * Survives GitHub's client-side navigation. GitHub currently ships two
 * regimes — Turbo-rendered pages (releases) firing turbo:* events, and
 * React-rendered pages (repo home) signalling via soft-nav:* — so we listen
 * to both plus popstate, with a debounced MutationObserver as the fallback
 * that also notices when GitHub replaces the container holding our panel.
 *
 * Only the pathname counts as navigation: README anchor links change the
 * hash without changing the page. No history.pushState monkey-patching, no
 * permanent polling.
 */

const NAV_EVENTS = ['turbo:render', 'turbo:load', 'soft-nav:end', 'popstate'] as const;
const DEBOUNCE_MS = 250;

export interface RouteObserver {
  stop(): void;
  /** Monotonic id; work started for an older generation must be dropped. */
  generation(): number;
}

/**
 * Calls back with a fresh generation whenever the path changes or the page
 * under `isMounted` loses our UI. `onSettled` runs after any burst of DOM
 * activity that did not amount to either, for cheap idempotent touch-ups
 * (GitHub lazy-loads release assets after our first pass).
 */
export function observeRoutes(
  callback: (generation: number) => void,
  isMounted: () => boolean,
  onSettled?: () => void,
  win: Window = window
): RouteObserver {
  let generation = 0;
  let lastPath = '';
  let debounceTimer: number | undefined;
  let stopped = false;

  const fire = () => {
    if (stopped) return;
    lastPath = win.location.pathname;
    generation += 1;
    callback(generation);
  };

  const schedule = () => {
    win.clearTimeout(debounceTimer);
    debounceTimer = win.setTimeout(() => {
      if (stopped) return;
      if (win.location.pathname !== lastPath || !isMounted()) fire();
      else onSettled?.();
    }, DEBOUNCE_MS);
  };

  // Navigation events can fire before the new DOM settles; debounce and
  // re-check rather than reacting to every intermediate state.
  const onNavigate = () => schedule();

  for (const name of NAV_EVENTS) win.addEventListener(name, onNavigate, true);

  const observer = new MutationObserver(schedule);
  observer.observe(win.document.documentElement, { childList: true, subtree: true });

  // First run happens immediately; the debounced path covers everything after.
  fire();

  return {
    stop() {
      stopped = true;
      win.clearTimeout(debounceTimer);
      for (const name of NAV_EVENTS) win.removeEventListener(name, onNavigate, true);
      observer.disconnect();
    },
    generation: () => generation,
  };
}
