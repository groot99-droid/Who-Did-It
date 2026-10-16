import { isValidCode, normalizeCode } from '../flags';
import { JOIN_FAILED_MESSAGE, NAME_MAX, NAME_MIN } from '../net/protocol';
import { getItem, setItem } from '../net/storage';
import { h, type Screen } from './dom';

export interface LandingOptions {
  /** Prefilled from the `#/join/CODE` deep link. */
  joinCode: string | null;
  onCreate(name: string): Promise<void>;
  onJoin(code: string, name: string): Promise<void>;
  /** After a failed join: a better message than the generic one, if there is one (stale build). */
  explainFailure?(): Promise<string | null>;
}

const NAME_KEY = 'wdi:name';

export function validateName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX)
    return `Name must be ${NAME_MIN} to ${NAME_MAX} characters.`;
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
    placeholder: 'CODE',
    value: opts.joinCode ?? '',
    'aria-label': 'Party code',
  });
  const create = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--primary wdi-btn--lg wdi-btn--block' },
    'Create Party',
  );
  const join = h(
    'button',
    { type: 'button', class: `wdi-btn wdi-grow${opts.joinCode ? ' wdi-btn--primary' : ''}` },
    'Join Party',
  );

  const setBusy = (busy: boolean) => {
    for (const el of [create, join, name, code]) el.toggleAttribute('disabled', busy);
    if (busy) say('Connecting...', false);
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
    h('p', { class: 'wdi-eyebrow' }, 'Hollowmere, after dark'),
    h(
      'h1',
      { id: 'landing-title', class: 'wdi-display wdi-display--lg' },
      opts.joinCode ? 'You are invited' : 'Gather your party',
    ),
    h(
      'div',
      { class: 'wdi-field' },
      h('label', { class: 'wdi-label', for: 'name' }, 'Your name'),
      name,
      h('p', { id: 'name-hint', class: 'wdi-field__msg' }, `${NAME_MIN} to ${NAME_MAX} characters`),
    ),
    create,
    h('div', { class: 'wdi-divider' }, 'or join a friend'),
    h('div', { class: 'wdi-row' }, code, join),
    message,
  );
  root.append(el);
  (opts.joinCode ? name : create).focus();
  return { destroy: () => el.remove() };
}
