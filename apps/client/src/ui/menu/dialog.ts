import { MENU_COPY as C } from '../copy';
import { h } from '../dom';

export interface MenuDialog {
  readonly el: HTMLElement;
  /** The element the content goes in; `title` is already there. */
  readonly body: HTMLElement;
  close(): void;
}

export interface DialogOptions {
  /** A unique id for `aria-labelledby`. */
  id: string;
  title: string;
  /** Called after the dialog is gone, by Esc, the scrim, the close button or `close()`. */
  onClose?(): void;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]';

/**
 * A modal glass dialog over the menu: Esc and a tap on the scrim close it, Tab stays inside, and focus goes back to
 * what had it. The ids and labels of what goes in are the caller's (the e2e fixture drives them).
 */
export function openDialog(root: HTMLElement, opts: DialogOptions): MenuDialog {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const closeBtn = h(
    'button',
    { type: 'button', class: 'wdi-menu-dialog__close', 'aria-label': C['dialog.close'] },
    '×',
  );
  const body = h('div', { class: 'wdi-menu-dialog__body wdi-stack' });
  const panel = h(
    'div',
    {
      class: 'wdi-menu-dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': opts.id,
    },
    h('h2', { id: opts.id, class: 'wdi-menu-dialog__title' }, opts.title),
    closeBtn,
    body,
  );
  const el = h('div', { class: 'wdi-scrim wdi-menu-scrim' }, panel);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.remove();
    opener?.focus();
    opts.onClose?.();
  };
  closeBtn.addEventListener('click', close);
  el.addEventListener('pointerdown', (e) => {
    if (e.target === el) close();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) return;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  root.append(el);
  return { el, body, close };
}
