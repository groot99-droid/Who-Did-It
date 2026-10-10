import { isValidCode, normalizeCode } from '../flags';
import { JOIN_FAILED_MESSAGE, NAME_MAX, NAME_MIN } from '../net/protocol';
import { getItem, setItem } from '../net/storage';
import { h, type Screen } from './dom';

export interface LandingOptions {
  /** Prefilled from the `#/join/CODE` deep link. */
  joinCode: string | null;
  onCreate(name: string): Promise<void>;
  onJoin(code: string, name: string): Promise<void>;
}

const NAME_KEY = 'wdi:name';

export function validateName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX)
    return `Name must be ${NAME_MIN} to ${NAME_MAX} characters.`;
  return null;
}

export function mountLanding(root: HTMLElement, opts: LandingOptions): Screen {
  const message = h('p', { class: 'msg', role: 'alert' });
  const name = h('input', {
    id: 'name',
    type: 'text',
    autocomplete: 'nickname',
    maxlength: NAME_MAX,
    value: getItem(NAME_KEY) ?? '',
    'aria-describedby': 'name-hint',
  });
  const code = h('input', {
    id: 'code',
    type: 'text',
    inputmode: 'text',
    autocapitalize: 'characters',
    autocomplete: 'off',
    maxlength: 5,
    placeholder: 'CODE',
    value: opts.joinCode ?? '',
    'aria-label': 'Party code',
  });
  const create = h('button', { type: 'button', class: 'primary' }, 'Create Party');
  const join = h('button', { type: 'button', class: opts.joinCode ? 'primary' : '' }, 'Join Party');

  const setBusy = (busy: boolean) => {
    for (const el of [create, join, name, code]) el.toggleAttribute('disabled', busy);
    if (busy) message.textContent = 'Connecting...';
  };

  const run = async (action: (name: string) => Promise<void>) => {
    const trimmed = name.value.trim();
    const problem = validateName(trimmed);
    if (problem !== null) {
      message.textContent = problem;
      name.focus();
      return;
    }
    setItem(NAME_KEY, trimmed);
    setBusy(true);
    try {
      await action(trimmed);
    } catch {
      message.textContent = JOIN_FAILED_MESSAGE;
      setBusy(false);
    }
  };

  create.addEventListener('click', () => void run((n) => opts.onCreate(n)));
  join.addEventListener('click', () => {
    if (!isValidCode(code.value)) {
      message.textContent = JOIN_FAILED_MESSAGE;
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
    { class: 'panel landing', 'aria-labelledby': 'landing-title' },
    h('h1', { id: 'landing-title' }, opts.joinCode ? 'You are invited' : 'Gather your party'),
    h('label', { for: 'name' }, 'Your name'),
    name,
    h('p', { id: 'name-hint', class: 'hint' }, `${NAME_MIN} to ${NAME_MAX} characters`),
    h('div', { class: 'row' }, create),
    h('div', { class: 'divider' }, 'or join a friend'),
    h('div', { class: 'row' }, code, join),
    message,
  );
  root.append(el);
  (opts.joinCode ? name : create).focus();
  return { destroy: () => el.remove() };
}
