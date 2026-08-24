/**
 * Panel CSS, injected into the shadow root. GitHub's Primer custom properties
 * inherit into shadow trees, so colors track the page theme; every var() has
 * a fallback, and a prefers-color-scheme block covers pages without them.
 * No external fonts, no global selectors — everything scoped to wtd-* classes.
 */

export const PANEL_CSS = `
:host {
  all: initial;
  display: block;
  color-scheme: light dark;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
}

.wtd-panel {
  --wtd-fg: var(--fgColor-default, #1f2328);
  --wtd-fg-muted: var(--fgColor-muted, #59636e);
  --wtd-bg: var(--bgColor-default, #ffffff);
  --wtd-bg-muted: var(--bgColor-muted, #f6f8fa);
  --wtd-border: var(--borderColor-default, #d1d9e0);
  --wtd-accent: var(--bgColor-success-emphasis, #1f883d);
  --wtd-accent-fg: var(--fgColor-onEmphasis, #ffffff);
  --wtd-attention: var(--fgColor-attention, #9a6700);

  box-sizing: border-box;
  margin: 0 0 16px;
  padding: 12px 16px;
  border: 1px solid var(--wtd-border);
  border-radius: 6px;
  background: var(--wtd-bg);
  color: var(--wtd-fg);
  font-size: 14px;
  line-height: 1.5;
}

@media (prefers-color-scheme: dark) {
  .wtd-panel {
    --wtd-fg: var(--fgColor-default, #f0f6fc);
    --wtd-fg-muted: var(--fgColor-muted, #9198a1);
    --wtd-bg: var(--bgColor-default, #0d1117);
    --wtd-bg-muted: var(--bgColor-muted, #151b23);
    --wtd-border: var(--borderColor-default, #3d444d);
    --wtd-accent: var(--bgColor-success-emphasis, #238636);
    --wtd-attention: var(--fgColor-attention, #d29922);
  }
}

.wtd-panel * {
  box-sizing: border-box;
  margin: 0;
}

.wtd-heading {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.wtd-meta {
  color: var(--wtd-fg-muted);
  font-size: 12px;
  margin-bottom: 8px;
}

.wtd-primary {
  margin: 8px 0;
  padding: 12px;
  border: 1px solid var(--wtd-border);
  border-radius: 6px;
  background: var(--wtd-bg-muted);
}

.wtd-filename {
  font-weight: 600;
  word-break: break-all;
}

.wtd-filedesc {
  color: var(--wtd-fg-muted);
  font-size: 12px;
  margin-top: 2px;
}

.wtd-download {
  display: inline-block;
  margin-top: 8px;
  padding: 6px 16px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--wtd-accent);
  color: var(--wtd-accent-fg);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.wtd-download:hover {
  filter: brightness(1.08);
}

.wtd-note {
  margin-top: 6px;
  font-size: 12px;
  color: var(--wtd-fg-muted);
}

.wtd-warning {
  margin-top: 6px;
  font-size: 12px;
  color: var(--wtd-attention);
}

.wtd-state {
  margin: 4px 0;
}

.wtd-details {
  margin-top: 8px;
  font-size: 13px;
}

.wtd-details summary {
  cursor: pointer;
  color: var(--wtd-fg-muted);
  user-select: none;
}

.wtd-details summary:hover {
  color: var(--wtd-fg);
}

.wtd-details[open] summary {
  margin-bottom: 6px;
}

.wtd-list {
  list-style: none;
  padding: 0;
}

.wtd-list li {
  padding: 6px 0;
  border-top: 1px solid var(--wtd-border);
}

.wtd-list .wtd-asset-line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: baseline;
}

.wtd-asset-link {
  color: inherit;
  font-weight: 500;
  text-decoration: none;
  word-break: break-all;
}

.wtd-asset-link:hover {
  text-decoration: underline;
}

.wtd-muted {
  color: var(--wtd-fg-muted);
}

.wtd-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--wtd-accent);
  color: var(--wtd-accent-fg);
}

.wtd-excluded {
  opacity: 0.75;
}

.wtd-evidence {
  margin: 4px 0 0 12px;
  padding: 0;
  font-size: 12px;
  color: var(--wtd-fg-muted);
  list-style: disc inside;
}

.wtd-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--wtd-border);
  font-size: 12px;
}

.wtd-controls label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--wtd-fg-muted);
}

.wtd-controls select {
  font: inherit;
  color: var(--wtd-fg);
  background: var(--wtd-bg);
  border: 1px solid var(--wtd-border);
  border-radius: 4px;
  padding: 2px 4px;
}

.wtd-button {
  font: inherit;
  font-size: 12px;
  color: var(--wtd-fg);
  background: var(--wtd-bg-muted);
  border: 1px solid var(--wtd-border);
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
}

.wtd-button:hover {
  background: var(--wtd-bg);
}

.wtd-footer {
  margin-top: 10px;
  font-size: 11px;
  color: var(--wtd-fg-muted);
}

.wtd-choice {
  display: block;
  width: 100%;
  text-align: left;
  margin-top: 6px;
  padding: 8px 12px;
  border: 1px solid var(--wtd-border);
  border-radius: 6px;
  background: var(--wtd-bg-muted);
  color: inherit;
  text-decoration: none;
}

.wtd-choice:hover {
  border-color: var(--wtd-fg-muted);
}

a:focus-visible,
button:focus-visible,
select:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--wtd-accent, #1f883d);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: no-preference) {
  .wtd-download,
  .wtd-button {
    transition: filter 80ms ease, background 80ms ease;
  }
}
`;

/** Class for the source-archive badge injected into GitHub's own list (light DOM). */
export const BADGE_CLASS = 'wtd-source-badge';
