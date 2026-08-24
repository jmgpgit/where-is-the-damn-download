# Architecture

Four layers, each ignorant of the ones above it:

```text
content script ──message──▶ background ──fetch──▶ api.github.com
     │                          │
     │ renders                  │ caches (storage.local), reads settings (storage.sync)
     ▼                          ▼
   src/ui                  src/github, src/storage
     │
     ▼
 src/domain  (pure classifier; also called from the content script)
```

## Layers

- **domain** — `recommend(assets, platform, preferences)`. Deterministic,
  order-independent, no imports outside the folder. Runs in the content
  script so a settings change re-ranks instantly. Rules and weights live in
  `rules.ts`; see CLASSIFIER.md.
- **github** — `url-parser` (route detection, reserved routes, tag decoding),
  `api-client` (headers, conditional requests, timeout, outcome union),
  `api-validation` (untrusted JSON → `ReleaseInfo`, asset URL checks),
  `release-selector` (prerelease policy). `fetch` is injected.
- **storage** — `settings` (versioned envelope in `storage.sync`, safe
  defaults) and `cache` (versioned envelope in `storage.local`, TTLs, pruning).
  Both take the storage area and `now` as arguments.
- **background** — `release-service` composes github + storage: cache lookup,
  fetch, validate, negative caching, stale fallback, in-flight dedup, refresh
  throttle. `index.ts` is the message router.
- **content** — `github-context` (page → typed context), `route-observer`
  (navigation survival), `mount` (single Shadow-DOM host, anchor list),
  `source-archive-annotation`, and `index.ts` which sequences them.
- **ui** — DOM-only components; `strings.ts` holds every user-visible string
  and the branding; `styles.ts` the shadow CSS.

## Message flow

```text
content: get-state {owner, repo, selector: latest | tag, surface: home | release}
background: validate shape → settings → panel off for this surface? ⇒ {disabled}
            → getPlatformInfo → normalize/override
            → (latest + include-prerelease setting ⇒ list endpoint)
            → release-service → {settings, platform, release}
content: recommend() → renderPanel()
content: save-settings {patch} → background merges onto fresh settings → content re-runs
```

The content script never sends URLs. The background builds every API URL
from validated identifiers (`shared/messages.ts` validators), so the message
channel cannot be used as a fetch proxy. Messages from other extensions are
refused by sender id.

## API flow and cache

| Situation                     | Behaviour                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Cached < 1 h                  | Answer from cache, no request                                                                                                                   |
| Cached 1 h – 7 d              | Request with `If-None-Match`; 304 restarts the window                                                                                           |
| Network / 5xx / rate limit    | Serve the ≤ 7 d entry, labelled stale; else error state                                                                                         |
| 404 on `/releases/latest`     | One list request: prereleases → "no stable release"; empty → "no releases"; 404 → "repository not found". Negative-cached 20 min                 |
| 404 on `/releases/tags/{tag}` | "no releases" for that route, negative-cached                                                                                                   |
| Manual refresh                | Bypasses the fresh window, at most once per 30 s per key                                                                                        |

Unauthenticated 304s still count against GitHub's 60/hr allowance, so the
fresh window — not revalidation — is the quota protection. The API version is
pinned in one constant (`GITHUB_API_VERSION`).

The cache stores only the trimmed `ReleaseInfo` (no release body). Both cache
and settings envelopes carry a schema version; a mismatch is treated as a
miss / defaults, which is the whole migration story for 0.1.

## Route lifecycle

1. `observeRoutes` fires immediately, then on `turbo:render`, `turbo:load`,
   `soft-nav:end`, `popstate`, and via a 250 ms-debounced MutationObserver.
   It calls back only when the URL changed or the panel it expects is gone.
2. Each callback carries a generation number. `run()` requests state, then
   drops the response if the generation moved on.
3. `mountPanel(routeKey)` reuses a connected host for the same route,
   replaces it otherwise, and does nothing when no anchor
   (`turbo-frame#repo-content-turbo-frame`, then `main`) exists.
4. When the panel is deliberately absent (disabled, unsupported route) the
   observer is told the page is settled, so mutations do not loop.

## Chrome vs Firefox

`manifest.src.json` is the Firefox manifest (`background.scripts`,
`browser_specific_settings.gecko` with the extension id and
`data_collection_permissions: none`). `tools/build.mjs` bundles three esbuild
IIFE entries per browser and derives the Chrome manifest: `service_worker`,
no `browser_specific_settings`. Runtime differences are absorbed by
`shared/browser-api.ts` (`browser ?? chrome`) and
`platform/normalize-platform.ts` (Firefox reports `aarch64`, Chrome `arm64`).

The service worker can be killed after 30 s idle: listeners register at top
level, nothing depends on module state surviving, and the in-flight dedup map
is best-effort only.

## Security boundaries

- No remote code, no `eval`, no CDN; default MV3 CSP untouched.
- Permissions: `storage`, host `https://api.github.com/*`, content script on
  `https://github.com/*`.
- API JSON is validated field by field; assets not in `uploaded` state are
  dropped; download URLs must be
  `https://github.com/{owner}/{repo}/releases/download/…` for the requested
  repository, re-checked again before an anchor is created.
- All page text is set with `textContent`. Release Markdown is never rendered.
- No tokens, no OAuth, no authentication.
