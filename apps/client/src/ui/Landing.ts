import { isValidCode, normalizeCode } from '../flags';
import { JOIN_FAILED_MESSAGE, NAME_MAX, NAME_MIN } from '../net/protocol';
import { getItem, setItem } from '../net/storage';
import { LOBBY_COPY as C, fill } from './copy';
import { h, type Screen } from './dom';
import { mountTrailer } from './landingTrailer';
import { mountSettingsPanel } from './SettingsPanel';

export interface LandingOptions {
  /** Prefilled from the `#/join/CODE` deep link. */
  joinCode: string | null;
  onCreate(name: string): Promise<void>;
  onJoin(code: string, name: string): Promise<void>;
  /** After a failed join: a better message than the generic one, if there is one (stale build). */
  explainFailure?(): Promise<string | null>;
  /** The music bus, so the trailer's soundtrack can start on the first tap (round 6, 6K). */
  music?: { crossfadeTo(playlistId: string | null): void };
}

const NAME_KEY = 'wdi:name';

export function validateName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX)
    return fill(C['landing.name.error'], { min: NAME_MIN, max: NAME_MAX });
  return null;
}

export function mountLanding(root: HTMLElement, opts: LandingOptions): Screen {
  const message = h('p', { class: 'wdi-field__msg', role: 'alert' });
  const say = (text: string, error = true) => {
    message.textContent = text;
    message.classList.toggle('wdi-field__msg--error', error && text !== '');
  };
  const name = h('input', {
    id: 'name',
    class: 'wdi-input',
    type: 'text',
    autocomplete: 'nickname',
    maxlength: NAME_MAX,
    value: getItem(NAME_KEY) ?? '',
    'aria-describedby': 'name-hint',
  });
  const code = h('input', {
    id: 'code',
    class: 'wdi-input wdi-input--code',
    type: 'text',
    inputmode: 'text',
    autocapitalize: 'characters',
    autocomplete: 'off',
    maxlength: 5,
    placeholder: C['landing.code.placeholder'],
    value: opts.joinCode ?? '',
    'aria-label': C['landing.code.label'],
  });
  const create = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--primary wdi-btn--lg wdi-btn--block' },
    C['landing.create'],
  );
  const join = h(
    'button',
    { type: 'button', class: `wdi-btn wdi-grow${opts.joinCode ? ' wdi-btn--primary' : ''}` },
    C['landing.join'],
  );

  const setBusy = (busy: boolean) => {
    for (const el of [create, join, name, code]) el.toggleAttribute('disabled', busy);
    if (busy) say(C['landing.connecting'], false);
  };

  const run = async (action: (name: string) => Promise<void>) => {
    const trimmed = name.value.trim();
    const problem = validateName(trimmed);
    if (problem !== null) {
      say(problem);
      name.focus();
      return;
    }
    setItem(NAME_KEY, trimmed);
    setBusy(true);
    try {
      await action(trimmed);
    } catch {
      say(JOIN_FAILED_MESSAGE);
      setBusy(false);
      void opts.explainFailure?.().then((better) => {
        if (better !== null) say(better);
      });
    }
  };

  create.addEventListener('click', () => void run((n) => opts.onCreate(n)));
  join.addEventListener('click', () => {
    if (!isValidCode(code.value)) {
      say(JOIN_FAILED_MESSAGE);
      code.focus();
      return;
    }
    void run((n) => opts.onJoin(normalizeCode(code.value), n));
  });
  code.addEventListener('input', () => {
    code.value = code.value.toUpperCase();
  });

  const el = h(
    'section',
    { class: 'wdi-panel wdi-stack', 'aria-labelledby': 'landing-title' },
    h('p', { class: 'wdi-eyebrow' }, C['landing.eyebrow']),
    h(
      'h1',
      { id: 'landing-title', class: 'wdi-display wdi-display--lg' },
      opts.joinCode ? C['landing.title.invited'] : C['landing.title'],
    ),
    h(
      'div',
      { class: 'wdi-field' },
      h('label', { class: 'wdi-label', for: 'name' }, C['landing.name.label']),
      name,
      h(
        'p',
        { id: 'name-hint', class: 'wdi-field__msg' },
        fill(C['landing.name.hint'], { min: NAME_MIN, max: NAME_MAX }),
      ),
    ),
    create,
    h('div', { class: 'wdi-divider' }, C['landing.divider']),
    h('div', { class: 'wdi-row' }, code, join),
    message,
  );
  // Round 6 (locked slots): the trailer loop (6K) and the settings gear (6L).
  const trailer = h('div', { class: 'wdi-landing__trailer', 'data-testid': 'landing-trailer', hidden: true });
  const settingsSlot = h('div', { class: 'wdi-landing__settings', 'data-testid': 'settings-slot' });
  const settings = mountSettingsPanel(settingsSlot);
  const trailerPlayer = mountTrailer(trailer, { base: import.meta.env.BASE_URL, music: opts.music });
  root.append(trailer, el, settingsSlot);
  (opts.joinCode ? name : create).focus();
  return {
    destroy: () => {
      settings.destroy();
      trailerPlayer.destroy();
      trailer.remove();
      settingsSlot.remove();
      el.remove();
    },
  };
}
