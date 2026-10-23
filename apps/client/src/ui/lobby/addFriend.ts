import balanceJson from '@wdi/content/data/balance.json';
import { getItem, setItem } from '../../net/storage';
import type { LobbyPlayer } from '../../net/protocol';
import { LOBBY_COPY as C, fill } from '../copy';
import { h } from '../dom';

/**
 * The "Add friend" action of a seat row. A stand-in for the helper 7C exports from `ui/menu/friends.ts` (round 7,
 * parties.md 4), with the one signature the lobby needs: a seat in, a button or `null` out. Replace this module's
 * body with a re-export of 7C's helper when it lands. The list is the device's `wdi:friends` (`{ code, name }`,
 * capped by `balance.json` `party.friendsMax`); a seat without a `profile` (a bot, an NPC, an old client) has no action.
 */
const KEY = 'wdi:friends';
interface Friend {
  code: string;
  name: string;
}

function readFriends(): Friend[] {
  try {
    const raw: unknown = JSON.parse(getItem(KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter((f): f is Friend => typeof f?.code === 'string' && typeof f?.name === 'string')
      : [];
  } catch {
    return [];
  }
}

export function addFriendButton(player: LobbyPlayer & { profile?: string }): HTMLButtonElement | null {
  const code = player.profile;
  if (code === undefined || code === '') return null;
  const known = () => readFriends().some((f) => f.code === code);
  const button = h(
    'button',
    {
      type: 'button',
      class: 'wdi-tag wdi-lobby__tag--action',
      'data-testid': 'add-friend',
      'aria-label': fill(C['lobby.friend.add.label'], { name: player.name }),
    },
    C['lobby.friend.add'],
  );
  const sync = () => {
    const done = known();
    button.disabled = done;
    button.textContent = done ? C['lobby.friend.added'] : C['lobby.friend.add'];
  };
  button.addEventListener('click', () => {
    const friends = readFriends();
    if (friends.length >= balanceJson.party.friendsMax || known()) return;
    setItem(KEY, JSON.stringify([...friends, { code, name: player.name }]));
    sync();
  });
  sync();
  return button;
}
