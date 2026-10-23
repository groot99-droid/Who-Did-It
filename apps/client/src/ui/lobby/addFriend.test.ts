import { beforeEach, describe, expect, it } from 'vitest';
import balanceJson from '@wdi/content/data/balance.json';
import { installFakeDom, type FakeNode } from '../main/fakeDom';
import { addFriendButton } from './addFriend';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const seat = { id: 's1', name: 'Mira', ready: false, connected: true };

describe('Add friend on a seat row (UI.md 14.26)', () => {
  beforeEach(() => {
    store.clear();
    installFakeDom();
  });

  it('offers nothing for a seat without a profile', () => {
    expect(addFriendButton(seat)).toBeNull();
    expect(addFriendButton({ ...seat, profile: '' })).toBeNull();
  });

  it('adds the profile once to the device list and then reads Friend', () => {
    const button = addFriendButton({ ...seat, profile: 'ABCD2345' }) as unknown as FakeNode & {
      disabled: boolean;
      textContent: string;
    };
    expect(button).not.toBeNull();
    button.click();
    button.click();
    expect(JSON.parse(store.get('wdi:friends') ?? '[]')).toEqual([{ code: 'ABCD2345', name: 'Mira' }]);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Friend');
  });

  it('starts as Friend when the code is already on the list, and stops at friendsMax', () => {
    store.set('wdi:friends', JSON.stringify([{ code: 'ABCD2345', name: 'Mira' }]));
    const known = addFriendButton({ ...seat, profile: 'ABCD2345' }) as unknown as { disabled: boolean };
    expect(known.disabled).toBe(true);

    const full = Array.from({ length: balanceJson.party.friendsMax }, (_, i) => ({
      code: String(i).padStart(8, 'X'),
      name: `f${i}`,
    }));
    store.set('wdi:friends', JSON.stringify(full));
    (addFriendButton({ ...seat, profile: 'ZZZZ9999' }) as unknown as FakeNode).click();
    expect(JSON.parse(store.get('wdi:friends') ?? '[]')).toHaveLength(balanceJson.party.friendsMax);
  });
});
