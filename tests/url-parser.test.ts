import { describe, expect, it } from 'vitest';

import { parsePageContext, type GitHubPageContext } from '../src/github/url-parser';

describe('parsePageContext', () => {
  const cases: Array<[string, GitHubPageContext]> = [
    // repository home
    ['https://github.com/acme/widget', { kind: 'repository-home', owner: 'acme', repo: 'widget' }],
    ['https://github.com/acme/widget/', { kind: 'repository-home', owner: 'acme', repo: 'widget' }],
    [
      'https://github.com/MiXeD-Case/Repo.Name_x',
      { kind: 'repository-home', owner: 'MiXeD-Case', repo: 'Repo.Name_x' },
    ],
    // .git stripped on repository home only
    ['https://github.com/acme/widget.git', { kind: 'repository-home', owner: 'acme', repo: 'widget' }],
    ['https://github.com/acme/widget.git/releases', { kind: 'releases-list', owner: 'acme', repo: 'widget.git' }],
    // releases routes
    ['https://github.com/acme/widget/releases', { kind: 'releases-list', owner: 'acme', repo: 'widget' }],
    ['https://github.com/acme/widget/releases/', { kind: 'releases-list', owner: 'acme', repo: 'widget' }],
    ['https://github.com/acme/widget/releases/latest', { kind: 'latest-release', owner: 'acme', repo: 'widget' }],
    [
      'https://github.com/acme/widget/releases/tag/v2.4.1',
      { kind: 'release-tag', owner: 'acme', repo: 'widget', tag: 'v2.4.1' },
    ],
    // tags with slashes: encoded and literal forms agree
    [
      'https://github.com/acme/widget/releases/tag/foo%2Fbar',
      { kind: 'release-tag', owner: 'acme', repo: 'widget', tag: 'foo/bar' },
    ],
    [
      'https://github.com/acme/widget/releases/tag/foo/bar',
      { kind: 'release-tag', owner: 'acme', repo: 'widget', tag: 'foo/bar' },
    ],
    [
      'https://github.com/acme/widget/releases/tag/releases%2Fv1.0',
      { kind: 'release-tag', owner: 'acme', repo: 'widget', tag: 'releases/v1.0' },
    ],
    // reserved first segments
    ['https://github.com/orgs/acme', { kind: 'unsupported' }],
    ['https://github.com/settings/profile', { kind: 'unsupported' }],
    ['https://github.com/open-source/widget', { kind: 'unsupported' }],
    ['https://github.com/Topics/widget', { kind: 'unsupported' }],
    ['https://github.com/.well-known/anything', { kind: 'unsupported' }],
    // invalid owners
    ['https://github.com/a--b/widget', { kind: 'unsupported' }],
    ['https://github.com/-acme/widget', { kind: 'unsupported' }],
    // wrong hostname
    ['https://gitlab.com/acme/widget', { kind: 'unsupported' }],
    ['https://api.github.com/repos/acme/widget', { kind: 'unsupported' }],
    ['https://gist.github.com/acme/abc123', { kind: 'unsupported' }],
    // deep or unrelated routes
    ['https://github.com/acme/widget/issues', { kind: 'unsupported' }],
    ['https://github.com/acme/widget/pull/17', { kind: 'unsupported' }],
    ['https://github.com/acme/widget/blob/main/README.md', { kind: 'unsupported' }],
    ['https://github.com/acme/widget/tree/main/src', { kind: 'unsupported' }],
    ['https://github.com/acme/widget/actions', { kind: 'unsupported' }],
    ['https://github.com/acme/widget/wiki', { kind: 'unsupported' }],
    ['https://github.com/acme/widget/releases/tag', { kind: 'unsupported' }],
    ['https://github.com/acme/widget/releases/latest/extra', { kind: 'unsupported' }],
    ['https://github.com/acme/widget/releases/download/v1/x.zip', { kind: 'unsupported' }],
    // too shallow
    ['https://github.com/acme', { kind: 'unsupported' }],
    ['https://github.com/', { kind: 'unsupported' }],
    // tag validation
    ['https://github.com/acme/widget/releases/tag/%ZZ', { kind: 'unsupported' }],
    ['https://github.com/acme/widget/releases/tag/v1%7Ebad', { kind: 'unsupported' }],
  ];

  it.each(cases)('%s', (url, expected) => {
    expect(parsePageContext(url)).toEqual(expected);
  });

  it('accepts a URL object', () => {
    expect(parsePageContext(new URL('https://github.com/acme/widget/releases'))).toEqual({
      kind: 'releases-list',
      owner: 'acme',
      repo: 'widget',
    });
  });

  it('returns unsupported for an unparseable string', () => {
    expect(parsePageContext('not a url')).toEqual({ kind: 'unsupported' });
  });
});
