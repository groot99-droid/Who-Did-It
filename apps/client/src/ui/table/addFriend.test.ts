import { beforeEach, describe, expect, it } from 'vitest';
import balance from '@wdi/content/data/balance.json';
import { FakeNode, installFakeDom } from '../main/fakeDom';
import { addFriend, isFriend, renderAddFriend } from './addFriend';

const store = new Map<string, string>();
beforeEach(() => {
  installFakeDom();
  store.clear();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
});

const button = (profile: string, name = 'Ada') =>
  renderAddFriend(profile, name) as unknown as FakeNode & {
    textContent: string;
    disabled: boolean;
  };

describe('the Add friend stand-in (7G, until 7C exports its helper)', () => {
  it('offers nothing for a seat without a profile', () => {
    expect(renderAddFriend('', 'Bot')).toBeNull();
  });

  it('adds the seat to wdi:friends on a click, then reads as added', () => {
    const b = button('ABCD1234');
    expect(b.textContent).toBe('Add friend');
    expect(b.disabled).toBe(false);
    b.click();
    expect(JSON.parse(store.get('wdi:friends') ?? '[]')).toEqual([{ code: 'ABCD1234', name: 'Ada' }]);
    expect(b.textContent).toBe('Friends');
    expect(b.disabled).toBe(true);
    expect(button('ABCD1234').textContent).toBe('Friends');
  });

  it('keeps one row per code and renames it', () => {
    expect(addFriend('X', 'Old')).toBe(true);
    expect(addFriend('X', 'New')).toBe(true);
    expect(JSON.parse(store.get('wdi:friends') ?? '[]')).toEqual([{ code: 'X', name: 'New' }]);
    expect(isFriend('X')).toBe(true);
  });

  it('refuses past the cap and survives corrupt storage', () => {
    for (let i = 0; i < balance.party.friendsMax; i++) expect(addFriend(`C${i}`, 'n')).toBe(true);
    expect(addFriend('LAST', 'n')).toBe(false);
    store.set('wdi:friends', '{not json');
    expect(isFriend('C0')).toBe(false);
  });
});
