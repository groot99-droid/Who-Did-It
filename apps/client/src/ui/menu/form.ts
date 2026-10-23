import { NAME_MAX, NAME_MIN } from '../../net/protocol';
import { MENU_COPY as C, fill } from '../copy';
import { h } from '../dom';

/** The name rule of the join options (2 to 16 characters); null when `raw` is fine. */
export function validateName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX)
    return fill(C['start.name.error'], { min: NAME_MIN, max: NAME_MAX });
  return null;
}

export interface NameField {
  el: HTMLElement;
  input: HTMLInputElement;
}

/** The labelled name input of both dialogs; `id` keeps the two apart, the label is what the specs find. */
export function nameField(id: string, label: string, initial: string): NameField {
  const input = h('input', {
    id,
    class: 'wdi-input',
    type: 'text',
    autocomplete: 'nickname',
    maxlength: NAME_MAX,
    value: initial,
    'aria-describedby': `${id}-hint`,
  });
  const el = h(
    'div',
    { class: 'wdi-field' },
    h('label', { class: 'wdi-label', for: id }, label),
    input,
    h(
      'p',
      { id: `${id}-hint`, class: 'wdi-field__msg' },
      fill(C['start.name.hint'], { min: NAME_MIN, max: NAME_MAX }),
    ),
  );
  return { el, input };
}

export interface MessageLine {
  el: HTMLElement;
  say(text: string, error?: boolean): void;
}

/** The one `role="alert"` line of a dialog: a failed create or join says its generic error here. */
export function messageLine(): MessageLine {
  const el = h('p', { class: 'wdi-field__msg', role: 'alert' });
  return {
    el,
    say(text, error = true) {
      el.textContent = text;
      el.classList.toggle('wdi-field__msg--error', error && text !== '');
    },
  };
}
