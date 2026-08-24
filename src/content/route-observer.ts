/**
 * Survives GitHub's client-side navigation. GitHub currently ships two
 * regimes — Turbo-rendered pages (releases) firing turbo:* events, and
 * React-rendered pages (repo home) signalling via soft-nav:* — so we listen
 * to both plus popstate, with a debounced MutationObserver as the fallback
 * that also notices when GitHub replaces the container holding our panel.
 *
 * No history.pushState monkey-patching, no permanent polling.
 */

const NAV_EVENTS = ['turbo:render', 'turbo:load', 'soft-nav:end', 'popstate'] as const;
const DEBOUNCE_MS = 250;

export interface RouteObserver {
  stop(): void;
  /** Monotonic id; work started for an older generation must be dropped. */
  generation(): number;
}

/**
 * Calls back with a fresh generation whenever the location changes or the
 * page under `isMounted` loses our UI. The callback itself decides what (and
 * whether) to render; it must be idempotent.
 */
export function observeRoutes(
  callback: (generation: number) => void,
  isMounted: () => boolean,
  win: Window = window
): RouteObserver {
  let generation = 0;
  let lastHref = '';
  let debounceTimer: number | undefined;
  let stopped = false;

  const fire = () => {
    if (stopped) return;
    lastHref = win.location.href;
    generation += 1;
    callback(generation);
  };

  const schedule = () => {
    win.clearTimeout(debounceTimer);
    debounceTimer = win.setTimeout(() => {
      if (stopped) return;
      if (win.location.href !== lastHref || !isMounted()) fire();
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
