import { readAudioSettings, writeAudioSettings, type AudioSettings } from '../view/audioSettings';
import { SETTINGS_COPY as S, fill } from './copy';
import { h } from './dom';

/**
 * The settings gear (round 6, docs/round6/cutscene-music.md 3, UI.md 14.22): a button that opens two volume sliders
 * (music, sound effects) and a mute, persisted by `view/audioSettings.ts`. Mounted on the landing, the lobby and the
 * HUD (locked slots); the pick is per player and never sent.
 */

/** A slider's 0 to 100 position as a 0 to 1 volume, and back. */
export const toVolume = (percent: number): number => Math.min(1, Math.max(0, Math.round(percent) / 100));
export const toPercent = (volume: number): number => Math.round(Math.min(1, Math.max(0, volume)) * 100);

export function mountSettingsPanel(root: HTMLElement): { destroy(): void } {
  let settings: AudioSettings = readAudioSettings();
  const uid = Math.random().toString(36).slice(2, 8);

  const row = (id: 'music' | 'sfx', label: string) => {
    const out = h('output', { class: 'wdi-settings__value', for: `${uid}-${id}` });
    const input = h('input', {
      type: 'range',
      min: 0,
      max: 100,
      step: 1,
      id: `${uid}-${id}`,
      class: 'wdi-settings__slider',
      'data-testid': `settings-${id}`,
    });
    const show = () => {
      input.value = String(toPercent(settings[id]));
      input.setAttribute('aria-valuetext', fill(S['settings.value'], { percent: input.value }));
      out.textContent = fill(S['settings.value'], { percent: input.value });
    };
    input.addEventListener('input', () => {
      settings = { ...settings, [id]: toVolume(Number(input.value)) };
      writeAudioSettings(settings);
      show();
    });
    show();
    return h('label', { class: 'wdi-settings__row', for: `${uid}-${id}` }, h('span', {}, label), input, out);
  };

  const mute = h('input', { type: 'checkbox', class: 'wdi-settings__mute', 'data-testid': 'settings-mute' });
  mute.checked = settings.muted;
  mute.addEventListener('change', () => {
    settings = { ...settings, muted: mute.checked };
    writeAudioSettings(settings);
  });

  const panel = h(
    'div',
    {
      class: 'wdi-settings__panel',
      id: `${uid}-panel`,
      role: 'group',
      'aria-label': S['settings.title'],
      hidden: true,
    },
    row('music', S['settings.music']),
    row('sfx', S['settings.sfx']),
    h(
      'label',
      { class: 'wdi-settings__row wdi-settings__row--mute' },
      mute,
      h('span', {}, S['settings.mute']),
    ),
  );

  const gear = h(
    'button',
    {
      type: 'button',
      class: 'wdi-settings__gear',
      'aria-label': S['settings.open'],
      'aria-expanded': 'false',
      'aria-controls': `${uid}-panel`,
      'data-testid': 'settings-gear',
    },
    '⚙',
  );
  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    gear.setAttribute('aria-expanded', String(open));
  };
  gear.addEventListener('click', () => setOpen(panel.hidden));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      gear.focus();
    }
  };
  panel.addEventListener('keydown', onKey);

  const wrap = h('div', { class: 'wdi-settings', 'data-testid': 'settings' }, gear, panel);
  root.append(wrap);
  return { destroy: () => wrap.remove() };
}
