/**
 * Narrows untrusted GitHub API JSON into the shared ReleaseInfo shapes.
 *
 * Policy: a release that fails top-level validation is an error; an asset
 * that fails validation is dropped silently and the release stays valid.
 * Download URLs must point at this exact repo's release-download space on
 * github.com over https — anything else is treated as hostile.
 */

import type { ReleaseAsset, ReleaseInfo } from '../shared/messages';
import { err, ok, type Result } from '../shared/result';
import type { GitHubAssetWire, GitHubReleaseWire } from './api-types';

const DIGEST = /^sha(256|512):[0-9a-f]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function validateRelease(json: unknown, owner: string, repo: string): Result<ReleaseInfo, string> {
  if (!isRecord(json)) return err('release is not an object');
  const r = json as GitHubReleaseWire;
  if (typeof r.id !== 'number') return err('release id is not numeric');
  if (typeof r.tag_name !== 'string') return err('release tag_name is not a string');
  if (typeof r.prerelease !== 'boolean') return err('release prerelease is not a boolean');
  if (r.draft !== false) return err('release is a draft');
  if (typeof r.html_url !== 'string') return err('release html_url is not a string');
  let htmlUrl: URL;
  try {
    htmlUrl = new URL(r.html_url);
  } catch {
    return err('release html_url is not a URL');
  }
  if (htmlUrl.protocol !== 'https:' || htmlUrl.hostname !== 'github.com') {
    return err('release html_url is not on github.com');
  }
  if (!Array.isArray(r.assets)) return err('release assets is not an array');

  const pathPrefix = `/${owner}/${repo}/releases/download/`.toLowerCase();
  const assets: ReleaseAsset[] = [];
  for (const candidate of r.assets) {
    const asset = validateAsset(candidate, pathPrefix);
    if (asset !== null) assets.push(asset);
  }

  return ok({
    id: r.id,
    tagName: r.tag_name,
    name: typeof r.name === 'string' ? r.name : null,
    htmlUrl: r.html_url,
    prerelease: r.prerelease,
    publishedAt: typeof r.published_at === 'string' ? r.published_at : null,
    assets,
  });
}

export function validateReleaseList(
  json: unknown,
  owner: string,
  repo: string,
): Result<ReleaseInfo[], string> {
  if (!Array.isArray(json)) return err('release list is not an array');
  const releases: ReleaseInfo[] = [];
  for (const entry of json) {
    const result = validateRelease(entry, owner, repo);
    if (result.ok) releases.push(result.value);
  }
  return ok(releases);
}

function validateAsset(value: unknown, pathPrefix: string): ReleaseAsset | null {
  if (!isRecord(value)) return null;
  const a = value as GitHubAssetWire;
  if (typeof a.id !== 'number') return null;
  if (typeof a.name !== 'string') return null;
  // Anything not fully uploaded ('starter', 'open', ...) is unusable.
  if (a.state !== 'uploaded') return null;
  if (typeof a.size !== 'number' || a.size < 0) return null;
  if (typeof a.download_count !== 'number' || a.download_count < 0) return null;
  if (typeof a.browser_download_url !== 'string') return null;
  let url: URL;
  try {
    url = new URL(a.browser_download_url);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null;
  if (!url.pathname.toLowerCase().startsWith(pathPrefix)) return null;

  return {
    id: a.id,
    name: a.name,
    label: typeof a.label === 'string' ? a.label : null,
    contentType: typeof a.content_type === 'string' ? a.content_type : null,
    size: a.size,
    downloadCount: a.download_count,
    browserDownloadUrl: a.browser_download_url,
    digest: typeof a.digest === 'string' && DIGEST.test(a.digest) ? a.digest : null,
  };
}
