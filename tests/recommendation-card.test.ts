// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassifiedAsset, Recommendation, UserPlatform } from '../src/domain/asset-types';
import type { ExtensionSettings } from '../src/shared/messages';
import { renderPanel, type PanelHandlers, type PanelView } from '../src/ui/recommendation-card';

const platform: UserPlatform = {
  os: 'windows',
  arch: 'x64',
  detectedOs: 'windows',
  detectedArch: 'x64',
  overridden: false,
};

const settings: ExtensionSettings = {
  enabled: true,
  mode: 'simple',
  operatingSystemOverride: 'auto',
  architectureOverride: 'auto',
  packagePreference: 'installer',
  releaseChannel: 'stable',
  showSourceWarnings: true,
  showOnRepositoryHome: true,
  showOnReleasePages: true,
};

function asset(overrides: Partial<ClassifiedAsset>): ClassifiedAsset {
  return {
    assetId: 1,
    name: 'app-setup-win64.exe',
    size: 1024 * 1024,
    downloadCount: 42,
    downloadUrl: 'https://github.com/o/r/releases/download/v1/app-setup-win64.exe',
    detectedOperatingSystems: ['windows'],
    detectedArchitectures: ['x64'],
    packageKind: 'windows-installer',
    roles: [],
    eligible: true,
    score: 100,
    evidence: [
      {
        ruleId: 'os-explicit',
        category: 'os',
        effect: 'positive',
        weight: 50,
        explanation: 'Marked for Windows.',
      },
    ],
    ...overrides,
  };
}

function recommendation(overrides: Partial<Recommendation>): Recommendation {
  return {
    confidence: 'high',
    primary: asset({}),
    alternatives: [],
    excluded: [],
    summary: 'This looks like the Windows installer.',
    warnings: [],
    ...overrides,
  };
}

function view(rec: Recommendation): Extract<PanelView, { kind: 'recommendation' }> {
  return {
    kind: 'recommendation',
    settings,
    platform,
    release: {
      id: 9,
      tagName: 'v1.0.0',
      name: 'v1.0.0',
      htmlUrl: 'https://github.com/o/r/releases/tag/v1.0.0',
      prerelease: false,
      publishedAt: '2026-01-01T00:00:00Z',
      assets: [],
    },
    stale: false,
    viewingTag: false,
    recommendation: rec,
  };
}

const handlers: PanelHandlers = { onSettingsChange: vi.fn(), onRefresh: vi.fn() };

describe('renderPanel', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    container = document.getElementById('c') as HTMLElement;
  });

  it('renders a high-confidence recommendation with a download button', () => {
    renderPanel(container, view(recommendation({})), handlers);
    const link = container.querySelector<HTMLAnchorElement>('.wtd-download');
    expect(link?.href).toBe('https://github.com/o/r/releases/download/v1/app-setup-win64.exe');
    expect(link?.rel).toContain('noopener');
    expect(container.querySelector('.wtd-heading')?.textContent).toContain('Recommended');
  });

  it('renders untrusted names as text, never markup', () => {
    const evil = '<img src=x onerror=alert(1)>.exe';
    renderPanel(container, view(recommendation({ primary: asset({ name: evil }) })), handlers);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.wtd-filename')?.textContent).toBe(evil);
  });

  it('refuses non-GitHub or non-https download URLs', () => {
    for (const bad of [
      'http://github.com/o/r/releases/download/v1/a.exe',
      'https://evil.example/o/r/releases/download/v1/a.exe',
      'https://github.com/o/r/archive/refs/tags/v1.zip',
      'javascript:alert(1)',
    ]) {
      renderPanel(container, view(recommendation({ primary: asset({ downloadUrl: bad }) })), handlers);
      expect(container.querySelector('.wtd-download'), bad).toBeNull();
    }
  });

  it('shows choices without a big button at low confidence', () => {
    const rec = recommendation({
      confidence: 'low',
      alternatives: [asset({ assetId: 2, name: 'app-portable.zip' })],
    });
    renderPanel(container, view(rec), handlers);
    expect(container.querySelector('.wtd-download')).toBeNull();
    expect(container.querySelectorAll('.wtd-choice').length).toBe(2);
  });

  it('renders warnings and stale/prerelease notices', () => {
    const rec = recommendation({ warnings: ['32-bit build on a 64-bit computer.'] });
    const v = view(rec);
    renderPanel(
      container,
      { ...v, stale: true, viewingTag: true, release: { ...v.release, prerelease: true } },
      handlers
    );
    const text = container.textContent ?? '';
    expect(text).toContain('32-bit build');
    expect(text).toContain('cached release information');
    expect(text).toContain('prerelease');
  });

  it('never calls a prerelease "stable", even off the tag page', () => {
    const v = view(recommendation({}));
    renderPanel(
      container,
      { ...v, viewingTag: false, release: { ...v.release, prerelease: true } },
      handlers
    );
    const meta = container.querySelector('.wtd-meta')?.textContent ?? '';
    expect(meta).not.toContain('stable');
    expect(meta).toContain('prerelease');
    expect(container.textContent).toContain('You are viewing a prerelease');
  });

  it('marks the recommended asset in the list with visible text', () => {
    renderPanel(container, view(recommendation({})), handlers);
    const badge = container.querySelector('.wtd-badge');
    expect(badge?.textContent).toBe('Recommended');
    expect(badge?.hasAttribute('aria-label')).toBe(false);
  });

  it('shows where-to-look hints when nothing can be recommended', () => {
    const rec = recommendation({ confidence: 'none', summary: 'Nothing to run here.' });
    delete rec.primary;
    renderPanel(
      container,
      { ...view(rec), hints: ['Try the README.', 'It may be a library.'] },
      handlers
    );
    const items = [...container.querySelectorAll('.wtd-hints li')].map((li) => li.textContent);
    expect(items).toEqual(['Try the README.', 'It may be a library.']);
    expect(container.querySelector('.wtd-download')).toBeNull();

    renderPanel(container, view(recommendation({})), handlers);
    expect(container.querySelector('.wtd-hints')).toBeNull();
  });

  it('renders status states with controls', () => {
    renderPanel(
      container,
      {
        kind: 'status',
        heading: 'No GitHub Releases found',
        body: 'This repository does not appear to publish finished downloads through GitHub Releases.',
        settings,
        platform,
      },
      handlers
    );
    expect(container.querySelector('.wtd-heading')?.textContent).toContain('No GitHub Releases');
    expect(container.querySelector('.wtd-controls')).not.toBeNull();
  });

  it('wires settings and refresh handlers', () => {
    const onSettingsChange = vi.fn();
    const onRefresh = vi.fn();
    renderPanel(container, view(recommendation({})), { onSettingsChange, onRefresh });

    const select = container.querySelector('select') as HTMLSelectElement;
    select.value = 'macos';
    select.dispatchEvent(new Event('change'));
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ operatingSystemOverride: 'macos' })
    );

    (container.querySelector('.wtd-button') as HTMLButtonElement).click();
    expect(onRefresh).toHaveBeenCalled();
  });

  it('mentions compatibility, not safety, in the footer', () => {
    renderPanel(container, view(recommendation({})), handlers);
    const foot = container.querySelector('.wtd-footer')?.textContent ?? '';
    expect(foot).toContain('not a security review');
    expect(foot).toContain('Not affiliated');
  });
});
