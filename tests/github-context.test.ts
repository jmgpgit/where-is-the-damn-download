// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://github.com/Owner/Repo" }
import { beforeEach, describe, expect, it } from 'vitest';
import { getPageContext } from '../src/content/github-context';

function setMeta(content: string | null): void {
  document.head.innerHTML = '';
  if (content === null) return;
  const meta = document.createElement('meta');
  meta.name = 'octolytics-dimension-repository_nwo';
  meta.content = content;
  document.head.append(meta);
}

describe('getPageContext', () => {
  beforeEach(() => {
    history.replaceState({}, '', '/Owner/Repo');
    setMeta(null);
  });

  it('routes from the URL when no metadata is present', () => {
    expect(getPageContext()).toEqual({ kind: 'repository-home', owner: 'Owner', repo: 'Repo' });
    history.replaceState({}, '', '/Owner/Repo/releases/tag/v1.0');
    expect(getPageContext()).toEqual({
      kind: 'release-tag',
      owner: 'Owner',
      repo: 'Repo',
      tag: 'v1.0',
    });
  });

  it('adopts the page metadata casing for the same repository', () => {
    setMeta('owner/repo');
    expect(getPageContext()).toEqual({ kind: 'repository-home', owner: 'owner', repo: 'repo' });
  });

  it('ignores metadata that names a different repository', () => {
    setMeta('someone/else');
    expect(getPageContext()).toEqual({ kind: 'repository-home', owner: 'Owner', repo: 'Repo' });
  });

  it('ignores malformed metadata', () => {
    setMeta('not a repo at all / / /');
    expect(getPageContext()).toEqual({ kind: 'repository-home', owner: 'Owner', repo: 'Repo' });
  });

  it('never upgrades an unsupported route', () => {
    history.replaceState({}, '', '/Owner/Repo/issues/12');
    setMeta('Owner/Repo');
    expect(getPageContext()).toEqual({ kind: 'unsupported' });
  });
});
