import { MENU_COPY as C, fill } from '../copy';
import { h } from '../dom';
import { openDialog, type MenuDialog } from './dialog';
import { messageLine } from './form';
import {
  addFriend,
  FRIENDS_MAX,
  isFriend,
  parseFriendInput,
  readFriends,
  removeFriend,
  type AddResult,
} from './friendsModel';

const ERRORS: Partial<Record<AddResult, string>> = {
  invalid: C['friends.err.invalid'],
  self: C['friends.err.self'],
  known: C['friends.err.known'],
  full: fill(C['friends.err.full'], { max: FRIENDS_MAX }),
};

/** The Friends panel: the list with Remove, and the field that takes a pasted code or share link. */
export function openFriendsPanel(opts: { root: HTMLElement; onClose?(): void }): MenuDialog {
  const dialog = openDialog(opts.root, {
    id: 'friends-title',
    title: C['friends.title'],
    ...(opts.onClose ? { onClose: opts.onClose } : {}),
  });
  const list = h('ul', { class: 'wdi-menu-friends', 'data-testid': 'friends-list' });
  const count = h('p', { class: 'wdi-field__msg', 'data-testid': 'friends-count' });
  const msg = messageLine();

  const render = () => {
    const friends = readFriends();
    list.replaceChildren(
      ...(friends.length === 0
        ? [h('li', { class: 'wdi-field__msg' }, C['friends.empty'])]
        : friends.map((f) => {
            const remove = h(
              'button',
              {
                type: 'button',
                class: 'wdi-btn wdi-btn--ghost wdi-btn--sm',
                'aria-label': fill(C['friends.remove.label'], { name: f.name }),
              },
              C['friends.remove'],
            );
            remove.addEventListener('click', () => {
              removeFriend(f.code);
              render();
            });
            return h(
              'li',
              { class: 'wdi-menu-friends__row' },
              h('span', { class: 'wdi-menu-friends__name' }, f.name),
              h('span', { class: 'wdi-menu-friends__code' }, f.code),
              remove,
            );
          })),
    );
    count.textContent = fill(C['friends.count'], { n: friends.length, max: FRIENDS_MAX });
  };

  const code = h('input', {
    id: 'friend-code',
    class: 'wdi-input',
    type: 'text',
    autocomplete: 'off',
    'aria-label': C['friends.code.label'],
    placeholder: C['friends.code.label'],
  });
  const name = h('input', {
    id: 'friend-name',
    class: 'wdi-input',
    type: 'text',
    autocomplete: 'off',
    'aria-label': C['friends.name.label'],
    placeholder: C['friends.name.label'],
  });
  const add = h('button', { type: 'button', class: 'wdi-btn wdi-btn--primary' }, C['friends.add']);
  const submit = () => {
    const parsed = parseFriendInput(code.value);
    const result = parsed === null ? 'invalid' : addFriend(parsed, name.value);
    if (result === 'added') {
      code.value = '';
      name.value = '';
      msg.say('', false);
      render();
      code.focus();
    } else msg.say(ERRORS[result] ?? '');
  };
  add.addEventListener('click', submit);
  for (const input of [code, name])
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });

  render();
  dialog.body.append(
    list,
    count,
    h('div', { class: 'wdi-field' }, code),
    h('div', { class: 'wdi-field' }, name),
    msg.el,
    h('div', { class: 'wdi-dialog__actions' }, add),
  );
  code.focus();
  return dialog;
}

/**
 * The "Add friend" action of a seat row, for the lobby roster and the game-over rows (7E, 7G): a seat in, a button
 * or `null` out. A seat without a `profile` (a bot, an NPC, an old client) or the device's own seat has no action.
 */
export function addFriendButton(
  seat: { name: string; profile?: string | undefined },
  className = 'wdi-menu-add-friend',
): HTMLButtonElement | null {
  const code = seat.profile;
  if (code === undefined || code === '') return null;
  const button = h(
    'button',
    {
      type: 'button',
      class: className,
      'data-testid': 'add-friend',
      'aria-label': fill(C['friends.seat.label'], { name: seat.name }),
    },
    C['friends.seat.add'],
  );
  const sync = () => {
    const done = isFriend(code);
    button.disabled = done;
    button.textContent = done ? C['friends.seat.added'] : C['friends.seat.add'];
  };
  button.addEventListener('click', () => {
    addFriend(code, seat.name);
    sync();
  });
  sync();
  return button;
}
