/**
 * Resolves what page we are on. URL parsing does the routing; when GitHub's
 * own repository metadata is present it corrects owner/repo casing, but it
 * never changes the detected route.
 */

import { parsePageContext, type GitHubPageContext } from '../github/url-parser';
import { isValidOwner, isValidRepo } from '../shared/messages';

export function getPageContext(doc: Document = document): GitHubPageContext {
  const context = parsePageContext(doc.location.href);
  if (context.kind === 'unsupported') return context;

  const nwo =
    doc.querySelector('meta[name="octolytics-dimension-repository_nwo"]')?.getAttribute('content') ??
    '';
  const [owner, repo, ...rest] = nwo.split('/');
  if (rest.length === 0 && owner && repo && isValidOwner(owner) && isValidRepo(repo)) {
    // Trust the page's own idea of the repository only when it names the same
    // one as the URL — it lags the URL during client-side navigation.
    if (
      owner.toLowerCase() === context.owner.toLowerCase() &&
      repo.toLowerCase() === context.repo.toLowerCase()
    ) {
      return { ...context, owner, repo };
    }
  }
  return context;
}
