import type { PartyVisibility } from '../../net/protocol';
import { JOIN_FAILED_MESSAGE } from '../../net/protocol';
import { MENU_COPY as C } from '../copy';
import { h } from '../dom';
import { openDialog, type MenuDialog } from './dialog';
import { messageLine, nameField, validateName } from './form';

export interface StartDialogOptions {
  root: HTMLElement;
  /** The remembered name (the profile's, from PR 2). */
  name: string;
  onCreate(name: string, visibility: PartyVisibility): Promise<void>;
  /** After a failed create: a better message than the generic one, if there is one (stale build). */
  explainFailure?(): Promise<string | null>;
  onClose?(): void;
}

const RADIO_NAME = 'party-visibility';

/** Start Game: asks the name and Open or Private, then creates (GDD 2 step 1, parties.md 4). */
export function openStartDialog(opts: StartDialogOptions): MenuDialog {
  const dialog = openDialog(opts.root, {
    id: 'start-title',
    title: C['start.title'],
    ...(opts.onClose ? { onClose: opts.onClose } : {}),
  });
  const name = nameField('start-name', C['start.name.label'], opts.name);
  const msg = messageLine();

  const choice = (value: PartyVisibility, label: string, hint: string) => {
    const input = h('input', { type: 'radio', name: RADIO_NAME, value, class: 'wdi-menu-choice__input' });
    input.checked = value === 'open';
    return {
      input,
      el: h(
        'label',
        { class: 'wdi-menu-choice' },
        input,
        h('span', { class: 'wdi-menu-choice__label' }, label),
        h('span', { class: 'wdi-menu-choice__hint' }, hint),
      ),
    };
  };
  const open = choice('open', C['start.open'], C['start.open.hint']);
  const priv = choice('private', C['start.private'], C['start.private.hint']);
  const visibility = h(
    'fieldset',
    { class: 'wdi-menu-choices' },
    h('legend', { class: 'wdi-label' }, C['start.visibility']),
    open.el,
    priv.el,
  );

  const create = h('button', { type: 'button', class: 'wdi-btn wdi-btn--primary' }, C['start.create']);
  const cancel = h('button', { type: 'button', class: 'wdi-btn wdi-btn--ghost' }, C['start.cancel']);
  const controls = [name.input, open.input, priv.input, create, cancel];
  const setBusy = (busy: boolean) => {
    for (const el of controls) el.toggleAttribute('disabled', busy);
    if (busy) msg.say(C['menu.connecting'], false);
  };

  const submit = async () => {
    const trimmed = name.input.value.trim();
    const problem = validateName(trimmed);
    if (problem !== null) {
      msg.say(problem);
      name.input.focus();
      return;
    }
    setBusy(true);
    try {
      await opts.onCreate(trimmed, priv.input.checked ? 'private' : 'open');
    } catch {
      msg.say(JOIN_FAILED_MESSAGE);
      setBusy(false);
      void opts.explainFailure?.().then((better) => {
        if (better !== null) msg.say(better);
      });
    }
  };
  create.addEventListener('click', () => void submit());
  cancel.addEventListener('click', dialog.close);
  name.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void submit();
  });

  dialog.body.append(name.el, visibility, msg.el, h('div', { class: 'wdi-dialog__actions' }, create, cancel));
  name.input.focus();
  return dialog;
}
