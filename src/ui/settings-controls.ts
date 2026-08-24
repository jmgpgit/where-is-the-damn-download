/**
 * The in-panel override controls. Only options the classifier actually
 * understands are offered; everything else belongs on the options page.
 */

import type { ExtensionSettings } from '../shared/messages';
import { ARCH_NAMES, LABELS, OS_NAMES } from './strings';

type Handler = (settings: ExtensionSettings) => void;

function select(
  doc: Document,
  label: string,
  value: string,
  options: Array<[value: string, label: string]>,
  onPick: (value: string) => void
): HTMLLabelElement {
  const wrap = doc.createElement('label');
  const text = doc.createElement('span');
  text.textContent = label;
  const el = doc.createElement('select');
  for (const [v, l] of options) {
    const opt = doc.createElement('option');
    opt.value = v;
    opt.textContent = l;
    if (v === value) opt.selected = true;
    el.append(opt);
  }
  el.addEventListener('change', () => onPick(el.value));
  wrap.append(text, el);
  return wrap;
}

function checkbox(
  doc: Document,
  label: string,
  checked: boolean,
  onToggle: (checked: boolean) => void
): HTMLLabelElement {
  const wrap = doc.createElement('label');
  const el = doc.createElement('input');
  el.type = 'checkbox';
  el.checked = checked;
  el.addEventListener('change', () => onToggle(el.checked));
  const text = doc.createElement('span');
  text.textContent = label;
  wrap.append(el, text);
  return wrap;
}

export function renderSettingsControls(
  settings: ExtensionSettings,
  onChange: Handler,
  doc: Document = document
): HTMLElement {
  const row = doc.createElement('div');
  row.className = 'wtd-controls';

  row.append(
    select(
      doc,
      LABELS.os,
      settings.operatingSystemOverride,
      [
        ['auto', LABELS.automatic],
        ['windows', OS_NAMES.windows],
        ['macos', OS_NAMES.macos],
        ['linux', OS_NAMES.linux],
      ],
      (v) =>
        onChange({
          ...settings,
          operatingSystemOverride: v as ExtensionSettings['operatingSystemOverride'],
        })
    ),
    select(
      doc,
      LABELS.arch,
      settings.architectureOverride,
      [
        ['auto', LABELS.automatic],
        ['x64', `${ARCH_NAMES.x64} / x86-64`],
        ['arm64', ARCH_NAMES.arm64],
        ['x86', `${ARCH_NAMES.x86} / x86`],
      ],
      (v) =>
        onChange({
          ...settings,
          architectureOverride: v as ExtensionSettings['architectureOverride'],
        })
    ),
    select(
      doc,
      LABELS.packagePreference,
      settings.packagePreference,
      [
        ['installer', 'Standard installer'],
        ['portable', 'Portable version'],
        ['none', 'No preference'],
      ],
      (v) =>
        onChange({ ...settings, packagePreference: v as ExtensionSettings['packagePreference'] })
    ),
    checkbox(doc, LABELS.includePrereleases, settings.releaseChannel === 'include-prerelease', (on) =>
      onChange({ ...settings, releaseChannel: on ? 'include-prerelease' : 'stable' })
    ),
    checkbox(doc, LABELS.advancedMode, settings.mode === 'advanced', (on) =>
      onChange({ ...settings, mode: on ? 'advanced' : 'simple' })
    )
  );

  return row;
}
