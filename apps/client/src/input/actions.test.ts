import abilitiesJson from '@wdi/content/data/abilities.json';
import rolesJson from '@wdi/content/data/roles.json';
import { ABILITY_KEYS } from '@wdi/shared/protocol';
import { describe, expect, it } from 'vitest';
import { ACTIONS, SLOT_ACTIONS, actionOfCode, cardSlots, codesOf } from './actions';

// Round 10, R1 (docs/round10/rolecards.md 3.3): the one action table stays whole.

const ROLES = rolesJson.roles as Record<string, { abilities: string[]; ships: string }>;
const KIND = abilitiesJson.abilities as unknown as Record<string, { kind: string }>;

describe('the action table', () => {
  it('never gives one key to two actions live at the same time', () => {
    for (const context of ['world', 'minigame'] as const) {
      const seen = new Map<string, string>();
      for (const row of ACTIONS.filter((a) => a.context === context)) {
        for (const code of row.codes) {
          expect(seen.get(code), `${code} in ${context}`).toBeUndefined();
          seen.set(code, row.id);
        }
      }
    }
  });

  it('has unique ids and a phone control for every slot', () => {
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length);
    for (const id of SLOT_ACTIONS) {
      const row = ACTIONS.find((a) => a.id === id);
      expect(row?.touch).toEqual({ kind: 'disc', disc: 'slot' });
    }
  });

  it('keys the slots on the card keys of the protocol', () => {
    expect(SLOT_ACTIONS.map((id) => codesOf(id)[0])).toEqual(ABILITY_KEYS.map((k) => `Key${k}`));
  });

  it('finds the world action of a key, and leaves a board key to its board', () => {
    expect(actionOfCode('KeyE')).toBe('use');
    expect(actionOfCode('Tab')).toBe('card');
    expect(actionOfCode('Digit3')).toBe('hotbar.3');
    expect(actionOfCode('KeyI')).toBe('pockets');
    expect(actionOfCode('Enter')).toBeNull();
    expect(actionOfCode('KeyZ')).toBeNull();
  });
});

describe('cardSlots', () => {
  it('gives the slots to the abilities that are not passive, in card order', () => {
    expect(cardSlots(['tasks', 'chalk', 'rope'].map((id) => ({ id })))).toEqual([
      { action: 'slot1', key: 'Q', id: 'chalk' },
      { action: 'slot2', key: 'R', id: 'rope' },
    ]);
    expect(cardSlots(['plantClue', 'crowbar', 'inherit'].map((id) => ({ id }))).map((s) => s.key)).toEqual([
      'Q',
      'R',
    ]);
    expect(cardSlots([{ id: 'lastShot' }])).toEqual([]);
    expect(cardSlots(null)).toEqual([]);
  });

  it('reaches every ability of every shipped card that is not passive, by key and by disc', () => {
    for (const [roleId, role] of Object.entries(ROLES)) {
      if (role.ships !== 'V1') continue;
      const wanted = role.abilities.filter((id) => KIND[id] !== undefined && KIND[id]!.kind !== 'passive');
      expect(
        cardSlots(role.abilities.map((id) => ({ id }))).map((s) => s.id),
        roleId,
      ).toEqual(wanted);
    }
  });
});
