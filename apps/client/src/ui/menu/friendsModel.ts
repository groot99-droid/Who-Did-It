import balanceJson from '@wdi/content/data/balance.json';
import { getItem, setItem } from '../../net/storage';
import { isProfileCode, readProfile } from './profileModel';

/**
 * The friends list (round 7, GDD 3.21): `{ code, name }` entries under `wdi:friends`, the name last seen under each
 * code, capped by `balance.json` `party.friendsMax`. It never leaves the device except as the leader's invited list.
 */
export const FRIENDS_KEY = 'wdi:friends';
export const FRIENDS_MAX: number = balanceJson.party.friendsMax;

export interface Friend {
  code: string;
  name: string;
}

export function readFriends(): Friend[] {
  try {
    const raw: unknown = JSON.parse(getItem(FRIENDS_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: Friend[] = [];
    for (const f of raw as Array<Partial<Friend> | null>) {
      if (typeof f?.code !== 'string' || typeof f.name !== 'string') continue;
      if (!isProfileCode(f.code) || seen.has(f.code)) continue;
      seen.add(f.code);
      out.push({ code: f.code, name: f.name });
    }
    return out.slice(0, FRIENDS_MAX);
  } catch {
    return [];
  }
}

const write = (friends: Friend[]): void => setItem(FRIENDS_KEY, JSON.stringify(friends));

/** The profile code in pasted text: a bare code or a link that carries one (the last that fits wins). */
export function parseFriendInput(text: string): string | null {
  const tokens = text
    .split(/[^A-Za-z0-9]+/)
    .map((t) => t.toUpperCase())
    .filter(isProfileCode);
  return tokens.at(-1) ?? null;
}

export type AddResult = 'added' | 'known' | 'full' | 'self' | 'invalid';

/** Adds a friend; a blank name falls back to the code. Never exceeds the cap, never adds the device's own code. */
export function addFriend(code: string, name: string): AddResult {
  if (!isProfileCode(code)) return 'invalid';
  if (readProfile()?.code === code) return 'self';
  const friends = readFriends();
  if (friends.some((f) => f.code === code)) return 'known';
  if (friends.length >= FRIENDS_MAX) return 'full';
  write([...friends, { code, name: name.trim() === '' ? code : name.trim() }]);
  return 'added';
}

export function removeFriend(code: string): void {
  write(readFriends().filter((f) => f.code !== code));
}

export const isFriend = (code: string): boolean => readFriends().some((f) => f.code === code);

/** Updates the name last seen under a friend's code from a roster (call it when a lobby snapshot arrives). */
export function refreshFriendNames(
  seats: ReadonlyArray<{ name: string; profile?: string | undefined }>,
): void {
  const friends = readFriends();
  let changed = false;
  const next = friends.map((f) => {
    const seat = seats.find((s) => s.profile === f.code);
    if (seat === undefined || seat.name === f.name) return f;
    changed = true;
    return { ...f, name: seat.name };
  });
  if (changed) write(next);
}
