import { MENU_COPY as C } from '../copy';
import { h } from '../dom';
import { openDialog, type MenuDialog } from './dialog';

export interface QuitOptions {
  root: HTMLElement;
  /** The consented leave of the party the device is in (clears its reconnection token); a no-op outside a party. */
  leave(): Promise<void>;
  music?: { crossfadeTo(playlistId: string | null): void } | undefined;
  onClose?(): void;
}

/**
 * Quit: a confirm, then the consented leave, the music to silence and a goodbye panel with "Back to the menu".
 * A page cannot close a tab it did not open, so `window.close()` is tried first and only in a window the page
 * opened itself (`window.opener`); anywhere else the goodbye panel is the end.
 */
export function openQuitDialog(opts: QuitOptions): MenuDialog {
  const dialog = openDialog(opts.root, {
    id: 'quit-title',
    title: C['quit.title'],
    ...(opts.onClose ? { onClose: opts.onClose } : {}),
  });
  const confirm = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--primary', 'data-testid': 'quit-confirm' },
    C['quit.confirm'],
  );
  const cancel = h('button', { type: 'button', class: 'wdi-btn wdi-btn--ghost' }, C['quit.cancel']);
  cancel.addEventListener('click', () => dialog.close());
  confirm.addEventListener('click', () => {
    confirm.disabled = true;
    void opts
      .leave()
      .catch(() => undefined)
      .then(() => {
        opts.music?.crossfadeTo(null);
        if (window.opener !== null) window.close();
        const back = h(
          'button',
          { type: 'button', class: 'wdi-btn wdi-btn--primary', 'data-testid': 'quit-back' },
          C['quit.back'],
        );
        back.addEventListener('click', () => dialog.close());
        dialog.body.replaceChildren(
          h('p', { class: 'wdi-field__msg', 'data-testid': 'quit-bye' }, C['quit.bye.body']),
          h('div', { class: 'wdi-dialog__actions' }, back),
        );
        back.focus();
      });
  });
  dialog.body.append(
    h('p', { class: 'wdi-field__msg' }, C['quit.body']),
    h('div', { class: 'wdi-dialog__actions' }, cancel, confirm),
  );
  confirm.focus();
  return dialog;
}
