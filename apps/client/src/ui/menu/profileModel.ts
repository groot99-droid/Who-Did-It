import { ROOM_CODE_ALPHABET } from '@wdi/shared';
import balanceJson from '@wdi/content/data/balance.json';
import { getItem, removeItem, setItem } from '../../net/storage';
import { NAME_MAX, NAME_MIN } from '../../net/protocol';

/**
 * The device profile (round 7, GDD 3.21, parties.md 4): a name and a profile code made on the device, kept under
 * `wdi:profile`. The code is not a secret and proves nothing. No DOM here: the net layer reads it for the join
 * options, the panel (`profile.ts`) edits it.
 */
export const PROFILE_KEY = 'wdi:profile';
/** The key before profiles: a name alone. Read once and migrated. */
export const OLD_NAME_KEY = 'wdi:name';

export interface Profile {
  name: string;
  code: string;
}

export const PROFILE_CODE_LENGTH: number = balanceJson.party.profileCodeLength;

/** Exact length, upper case, the join-code alphabet (the server checks the same). */
export function isProfileCode(raw: string): boolean {
  return raw.length === PROFILE_CODE_LENGTH && [...raw].every((ch) => ROOM_CODE_ALPHABET.includes(ch));
}

/** A fresh code; `pick(n)` returns an integer in `[0, n)` (random by default, injectable for tests). */
export function makeProfileCode(pick: (n: number) => number = randomBelow): string {
  let code = '';
  for (let i = 0; i < PROFILE_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[pick(ROOM_CODE_ALPHABET.length)];
  return code;
}

function randomBelow(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! % n;
}

const nameFits = (name: string): boolean => name.length >= NAME_MIN && name.length <= NAME_MAX;

/** A stored value back into a profile; anything damaged or out of range is no profile. */
export function parseProfile(raw: string | null): Profile | null {
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as Partial<Profile> | null;
    if (typeof v?.name !== 'string' || typeof v.code !== 'string') return null;
    const name = v.name.trim();
    return nameFits(name) && isProfileCode(v.code) ? { name, code: v.code } : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile): void {
  setItem(PROFILE_KEY, JSON.stringify(profile));
}

/**
 * The device's profile, or null for a guest. A device that has only the old `wdi:name` becomes a profile with it
 * (a fresh code), and the old key goes: the name is read once and migrated.
 */
export function readProfile(): Profile | null {
  const stored = parseProfile(getItem(PROFILE_KEY));
  if (stored !== null) return stored;
  const old = getItem(OLD_NAME_KEY)?.trim() ?? '';
  if (old === '') return null;
  removeItem(OLD_NAME_KEY);
  if (!nameFits(old)) return null;
  const migrated: Profile = { name: old, code: makeProfileCode() };
  saveProfile(migrated);
  return migrated;
}

/** The code the join options carry, or undefined for a guest. */
export function profileCode(): string | undefined {
  return readProfile()?.code;
}
