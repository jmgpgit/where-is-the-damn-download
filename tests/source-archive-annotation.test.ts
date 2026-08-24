// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { annotateSourceArchives } from '../src/content/source-archive-annotation';
import { BADGE_CLASS } from '../src/ui/styles';

describe('annotateSourceArchives', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('annotates GitHub-generated source archive links exactly once', () => {
    document.body.innerHTML = `
      <a id="zip" href="https://github.com/o/r/archive/refs/tags/v1.0.zip">Source code (zip)</a>
      <a id="tar" href="https://github.com/o/r/archive/refs/tags/v1.0.tar.gz">Source code (tar.gz)</a>
    `;
    expect(annotateSourceArchives('o', 'r')).toBe(2);
    expect(document.querySelectorAll(`.${BADGE_CLASS}`)).toHaveLength(2);
    expect(document.querySelector(`.${BADGE_CLASS}`)?.textContent).toContain('Source code');

    // Idempotent on re-run.
    expect(annotateSourceArchives('o', 'r')).toBe(0);
    expect(document.querySelectorAll(`.${BADGE_CLASS}`)).toHaveLength(2);
  });

  it('does not touch the link itself', () => {
    document.body.innerHTML =
      '<a id="zip" href="https://github.com/o/r/archive/refs/tags/v1.0.zip">Source</a>';
    annotateSourceArchives('o', 'r');
    const link = document.getElementById('zip') as HTMLAnchorElement;
    expect(link.href).toBe('https://github.com/o/r/archive/refs/tags/v1.0.zip');
    expect(link.isConnected).toBe(true);
  });

  it('ignores branch archives, other repos, and other hosts', () => {
    document.body.innerHTML = `
      <a href="https://github.com/o/r/archive/refs/heads/main.zip">branch</a>
      <a href="https://github.com/x/y/archive/refs/tags/v1.zip">other repo</a>
      <a href="https://evil.example/o/r/archive/refs/tags/v1.zip">other host</a>
    `;
    expect(annotateSourceArchives('o', 'r')).toBe(0);
    expect(document.querySelectorAll(`.${BADGE_CLASS}`)).toHaveLength(0);
  });

  it('matches the tag prefix case-insensitively', () => {
    document.body.innerHTML = '<a href="https://github.com/O/R/archive/refs/tags/v1.zip">Source</a>';
    expect(annotateSourceArchives('o', 'r')).toBe(1);
  });
});
