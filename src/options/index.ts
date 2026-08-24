/**
 * The options page: the full settings surface, saved straight to
 * storage.sync. The in-page panel offers the subset that matters in place.
 */

import { ext } from '../shared/browser-api';
import type { ExtensionSettings } from '../shared/messages';
import { loadSettings, saveSettings } from '../storage/settings';
import { ARCH_NAMES, BRAND, DISCLAIMERS, LABELS, OS_NAMES } from '../ui/strings';

const app = document.getElementById('app');

function label(text: string, control: HTMLElement): HTMLLabelElement {
  const wrap = document.createElement('label');
  const span = document.createElement('span');
  span.textContent = text;
  if (control instanceof HTMLInputElement && control.type === 'checkbox') {
    wrap.append(control, span);
  } else {
    wrap.append(span, control);
  }
  return wrap;
}

function makeSelect(
  value: string,
  options: Array<[string, string]>,
  onPick: (value: string) => void
): HTMLSelectElement {
  const select = document.createElement('select');
  for (const [v, text] of options) {
    const option = document.createElement('option');
    option.value = v;
    option.textContent = text;
    option.selected = v === value;
    select.append(option);
  }
  select.addEventListener('change', () => onPick(select.value));
  return select;
}

function makeCheckbox(checked: boolean, onToggle: (on: boolean) => void): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onToggle(input.checked));
  return input;
}

function fieldset(legendText: string, ...children: HTMLElement[]): HTMLFieldSetElement {
  const set = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = legendText;
  set.append(legend, ...children);
  return set;
}

async function main(): Promise<void> {
  if (!app) return;
  let settings = await loadSettings(ext.storage.sync);
  const status = document.createElement('div');
  status.id = 'status';
  status.setAttribute('role', 'status');

  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  const update = (next: Partial<ExtensionSettings>) => {
    settings = { ...settings, ...next };
    void saveSettings(ext.storage.sync, settings).then(() => {
      status.textContent = 'Saved.';
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        status.textContent = '';
      }, 1500);
    });
  };

  const title = document.createElement('h1');
  title.textContent = BRAND.name;

  const intro = document.createElement('p');
  intro.className = 'muted';
  intro.textContent =
    'Finds the ready-to-run download for your computer in GitHub releases. ' +
    DISCLAIMERS.affiliation;

  const general = fieldset(
    'General',
    label('Enabled', makeCheckbox(settings.enabled, (on) => update({ enabled: on }))),
    label(
      'Show panel on repository pages',
      makeCheckbox(settings.showOnRepositoryHome, (on) => update({ showOnRepositoryHome: on }))
    ),
    label(
      'Show panel on release pages',
      makeCheckbox(settings.showOnReleasePages, (on) => update({ showOnReleasePages: on }))
    ),
    label(
      'Mark source-code archives on release pages',
      makeCheckbox(settings.showSourceWarnings, (on) => update({ showSourceWarnings: on }))
    ),
    label(
      LABELS.advancedMode,
      makeCheckbox(settings.mode === 'advanced', (on) => update({ mode: on ? 'advanced' : 'simple' }))
    )
  );

  const platform = fieldset(
    'This computer',
    label(
      LABELS.os,
      makeSelect(
        settings.operatingSystemOverride,
        [
          ['auto', LABELS.automatic],
          ['windows', OS_NAMES.windows],
          ['macos', OS_NAMES.macos],
          ['linux', OS_NAMES.linux],
        ],
        (v) =>
          update({ operatingSystemOverride: v as ExtensionSettings['operatingSystemOverride'] })
      )
    ),
    label(
      LABELS.arch,
      makeSelect(
        settings.architectureOverride,
        [
          ['auto', LABELS.automatic],
          ['x64', `${ARCH_NAMES.x64} / x86-64`],
          ['arm64', ARCH_NAMES.arm64],
          ['x86', `${ARCH_NAMES.x86} / x86`],
        ],
        (v) => update({ architectureOverride: v as ExtensionSettings['architectureOverride'] })
      )
    )
  );

  const downloads = fieldset(
    'Downloads',
    label(
      LABELS.packagePreference,
      makeSelect(
        settings.packagePreference,
        [
          ['installer', 'Standard installer'],
          ['portable', 'Portable version'],
          ['none', 'No preference'],
        ],
        (v) => update({ packagePreference: v as ExtensionSettings['packagePreference'] })
      )
    ),
    label(
      LABELS.includePrereleases,
      makeCheckbox(settings.releaseChannel === 'include-prerelease', (on) =>
        update({ releaseChannel: on ? 'include-prerelease' : 'stable' })
      )
    )
  );

  const disclaimer = document.createElement('p');
  disclaimer.className = 'muted';
  disclaimer.textContent = DISCLAIMERS.compatibility;

  app.append(title, intro, general, platform, downloads, status, disclaimer);
}

void main();
