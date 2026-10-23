import { isValidCode, normalizeCode } from '../../flags';
import { JOIN_FAILED_MESSAGE } from '../../net/protocol';
import { MENU_COPY as C } from '../copy';
import { h } from '../dom';
import { openDialog, type MenuDialog } from './dialog';
import { messageLine, nameField, validateName } from './form';

export interface CodeBoxOptions {
  root: HTMLElement;
  /** Prefilled from the `#/join/CODE` deep link; the box then says "You are invited". */
  code: string | null;
  /** The remembered name (the profile's, from PR 2). */
  name: string;
  onJoin(code: string, name: string): Promise<void>;
  explainFailure?(): Promise<string | null>;
  onClose?(): void;
}

/** The code box ("Have a code?", and the `#/join/CODE` link): the old landing's code and name fields in a dialog. */
export function openCodeBox(opts: CodeBoxOptions): MenuDialog {
  const dialog = openDialog(opts.root, {
    id: 'code-title',
    title: opts.code !== null ? C['code.title.invited'] : C['code.title'],
    ...(opts.onClose ? { onClose: opts.onClose } : {}),
  });
  const name = nameField('code-name', C['code.name.label'], opts.name);
  const code = h('input', {
    id: 'code',
    class: 'wdi-input wdi-input--code',
    type: 'text',
    inputmode: 'text',
    autocapitalize: 'characters',
    autocomplete: 'off',
    maxlength: 5,
    placeholder: C['code.placeholder'],
    value: opts.code ?? '',
    'aria-label': C['code.label'],
  });
  const msg = messageLine();
  const join = h(
    'button',
    { type: 'button', class: `wdi-btn wdi-btn--primary${opts.code !== null ? '' : ' wdi-btn--ghost'}` },
    C['code.join'],
  );
  const setBusy = (busy: boolean) => {
    for (const el of [name.input, code, join]) el.toggleAttribute('disabled', busy);
    if (busy) msg.say(C['menu.connecting'], false);
  };

  const submit = async () => {
    if (!isValidCode(code.value)) {
      msg.say(JOIN_FAILED_MESSAGE);
      code.focus();
      return;
    }
    const trimmed = name.input.value.trim();
    const problem = validateName(trimmed);
    if (problem !== null) {
      msg.say(problem);
      name.input.focus();
      return;
    }
    setBusy(true);
    try {
      await opts.onJoin(normalizeCode(code.value), trimmed);
    } catch {
      msg.say(JOIN_FAILED_MESSAGE);
      setBusy(false);
      void opts.explainFailure?.().then((better) => {
        if (better !== null) msg.say(better);
      });
    }
  };
  join.addEventListener('click', () => void submit());
  code.addEventListener('input', () => {
    code.value = code.value.toUpperCase();
  });
  for (const input of [name.input, code])
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void submit();
    });

  dialog.body.append(
    h('div', { class: 'wdi-field' }, code),
    name.el,
    msg.el,
    h('div', { class: 'wdi-dialog__actions' }, join),
  );
  (opts.code !== null ? name.input : code).focus();
  return dialog;
}
