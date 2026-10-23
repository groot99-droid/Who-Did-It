import balance from '@wdi/content/data/balance.json';
import { fill } from '../copy';
import { TABLE_COPY as C } from '../copy/table';
import { h } from '../dom';

// The "Add friend" action on a game-over row (GDD 3.21). 7C owns the friends list (`ui/menu/friends.ts`) and
// exports the shared helper; until it lands this is a local stand-in with the same job: a `{ code, name }`
// row under `wdi:friends`, capped by `balance.party.friendsMax`. Public data only: a profile code is not a role.

const KEY = 'wdi:friends';

export interface Friend {
  code: string;
  name: string;
}

function readFriends(): Friend[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter(
          (f): f is Friend => typeof f?.code === 'string' && typeof f?.name === 'string' && f.code !== '',
        )
      : [];
  } catch {
    return [];
  }
}

export function isFriend(code: string): boolean {
  return readFriends().some((f) => f.code === code);
}

/** Adds the seat; false when the list is full or storage refuses. An existing code only renames. */
export function addFriend(code: string, name: string): boolean {
  const list = readFriends();
  const known = list.find((f) => f.code === code);
  if (known === undefined && list.length >= balance.party.friendsMax) return false;
  if (known !== undefined) known.name = name;
  else list.push({ code, name });
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** The button for a seat's row; nothing for a seat without a profile (a bot, a guest, an old client). */
export function renderAddFriend(profile: string, name: string): HTMLElement | null {
  if (profile === '') return null;
  const button = h('button', {
    type: 'button',
    class: 'wdi-btn wdi-btn--ghost wdi-btn--sm wdi-friend',
    'data-testid': `add-friend-${profile}`,
  });
  const paint = (added: boolean) => {
    button.textContent = added ? C['friend.added'] : C['friend.add'];
    button.disabled = added;
    button.setAttribute(
      'aria-label',
      fill(added ? C['friend.added.label'] : C['friend.add.label'], { name }),
    );
  };
  paint(isFriend(profile));
  button.addEventListener('click', () => {
    if (addFriend(profile, name)) paint(true);
    else button.textContent = C['friend.full'];
  });
  return button;
}
