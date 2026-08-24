/**
 * Raw wire shapes from the GitHub REST API.
 *
 * Every field is `unknown` on purpose: API JSON is untrusted until
 * github/api-validation narrows it into the shared ReleaseInfo shapes.
 * These interfaces only document which keys the validator reads.
 */

export interface GitHubAssetWire {
  id?: unknown;
  name?: unknown;
  label?: unknown;
  content_type?: unknown;
  state?: unknown;
  size?: unknown;
  download_count?: unknown;
  browser_download_url?: unknown;
  digest?: unknown;
}

export interface GitHubReleaseWire {
  id?: unknown;
  tag_name?: unknown;
  name?: unknown;
  html_url?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  published_at?: unknown;
  assets?: unknown;
}
