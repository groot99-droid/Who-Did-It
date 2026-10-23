import { beforeEach, describe, expect, it } from 'vitest';
import { ROOM_CODE_ALPHABET } from '@wdi/shared';
import balanceJson from '@wdi/content/data/balance.json';
import { installFakeDom, type FakeNode } from '../main/fakeDom';
import {
  addFriend,
  FRIENDS_MAX,
  isFriend,
  parseFriendInput,
  readFriends,
  removeFriend,
} from './friendsModel';
import { addFriendButton } from './friends';
import { isProfileCode, makeProfileCode, parseProfile, readProfile, saveProfile } from './profileModel';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const CODE = 'ABCD2345';

describe('the profile', () => {
  beforeEach(() => store.clear());

  it('makes codes of the balance length from the join alphabet', () => {
    const code = makeProfileCode();
    expect(code).toHaveLength(balanceJson.party.profileCodeLength);
    expect(isProfileCode(code)).toBe(true);
    expect(isProfileCode('abcd2345')).toBe(false);
    expect(isProfileCode('ABCD234I')).toBe(false);
  });

  it('rejects damaged storage', () => {
    expect(parseProfile('{')).toBeNull();
    expect(parseProfile(JSON.stringify({ name: 'Mira', code: 'x' }))).toBeNull();
    expect(parseProfile(JSON.stringify({ name: 'M', code: CODE }))).toBeNull();
  });

  it('migrates the old name once, with a fresh code', () => {
    store.set('wdi:name', 'Mira');
    const first = readProfile();
    expect(first?.name).toBe('Mira');
    expect(store.has('wdi:name')).toBe(false);
    expect(readProfile()).toEqual(first);
  });

  it('is a guest without either key', () => {
    expect(readProfile()).toBeNull();
    saveProfile({ name: 'Mira', code: CODE });
    expect(readProfile()).toEqual({ name: 'Mira', code: CODE });
  });
});

describe('the friends list', () => {
  beforeEach(() => store.clear());

  it('takes a bare code or a link', () => {
    expect(parseFriendInput(' abcd2345 ')).toBe(CODE);
    expect(parseFriendInput('https://x.example/Who-Did-It/#/friend/ABCD2345')).toBe(CODE);
    expect(parseFriendInput('nope')).toBeNull();
  });

  it('adds once, never itself, removes, and stops at the cap', () => {
    expect(addFriend(CODE, ' ')).toBe('added');
    expect(readFriends()).toEqual([{ code: CODE, name: CODE }]);
    expect(addFriend(CODE, 'Mira')).toBe('known');
    expect(isFriend(CODE)).toBe(true);
    removeFriend(CODE);
    expect(readFriends()).toEqual([]);
    saveProfile({ name: 'Me', code: 'MMMMMMMM' });
    expect(addFriend('MMMMMMMM', 'Me')).toBe('self');
    expect(addFriend('nope', 'x')).toBe('invalid');
    store.set(
      'wdi:friends',
      JSON.stringify(
        Array.from({ length: FRIENDS_MAX }, (_, i) => ({
          code: `AAAAAA${ROOM_CODE_ALPHABET[Math.floor(i / 30)]}${ROOM_CODE_ALPHABET[i % 30]}`,
          name: 'f',
        })),
      ),
    );
    expect(addFriend(CODE, 'Mira')).toBe('full');
  });
});

describe('addFriendButton', () => {
  beforeEach(() => {
    store.clear();
    installFakeDom();
  });

  it('offers nothing without a profile and disables itself once added', () => {
    expect(addFriendButton({ name: 'Bot' })).toBeNull();
    const button = addFriendButton({ name: 'Mira', profile: CODE }) as unknown as FakeNode & {
      disabled: boolean;
    };
    button.click();
    expect(isFriend(CODE)).toBe(true);
    expect(button.disabled).toBe(true);
  });
});
