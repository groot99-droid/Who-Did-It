import { describe, expect, it } from 'vitest';
import { traits } from '@wdi/content';
import balance from '@wdi/content/data/balance.json';
import { MOCK_ROLE_REVEAL } from '../net/fixtures';
import type { RoleRevealPayload } from '../net/protocol';
import {
  coverChoices,
  createCoverModel,
  lookLine,
  ROLE_CARD_SECONDS,
  roleTitle,
  TRAIT_LABELS,
} from './RoleCard';

describe('role card text', () => {
  it('builds the look line from traits', () => {
    expect(lookLine({ height: 'tall', scarf: 'green', hat: 'bowler' })).toBe(
      'You look like: Tall / Green scarf / Bowler hat',
    );
    expect(lookLine({ height: 'short', scarf: 'red', hat: 'bare' })).toBe(
      'You look like: Short / Red scarf / Bare head',
    );
  });

  it('humanises role ids', () => {
    expect(roleTitle('killer')).toBe('Killer');
    expect(roleTitle('sin_eater')).toBe('Sin Eater');
  });
});

describe('trait labels', () => {
  it('match traits.json ids and labels', () => {
    for (const axis of ['height', 'scarf', 'hat'] as const) {
      const fromData = Object.fromEntries(traits.axes[axis].values.map((v) => [v.id, v.label]));
      expect(TRAIT_LABELS[axis]).toEqual(fromData);
    }
  });
});

describe('role card hold', () => {
  it('reads the hold from balance.json', () => {
    expect(ROLE_CARD_SECONDS).toBe(balance.phases.roleRevealS);
  });
});

const DECK = ['killer', 'accomplice', 'detective', 'vicar', 'doctor', 'lamplighter', 'baker'];
const cover = (over: Partial<RoleRevealPayload> = {}): RoleRevealPayload =>
  ({
    ...MOCK_ROLE_REVEAL,
    roleId: 'killer',
    team: 'cabal',
    deck: DECK,
    look: 'baker',
    coverHints: ['baker', 'lamplighter'],
    teammates: [{ id: 'mate', name: 'Moss' }],
    ...over,
  }) as RoleRevealPayload;

describe('cover picker choices (GDD 3.17)', () => {
  it("lists the hints first, marked safe, then the deck's other non-cover looks, each once", () => {
    expect(coverChoices(DECK, ['baker', 'lamplighter'])).toEqual([
      { lookId: 'baker', safe: true },
      { lookId: 'lamplighter', safe: true },
      { lookId: 'detective', safe: false },
      { lookId: 'vicar', safe: false },
      { lookId: 'doctor', safe: false },
    ]);
  });

  it('never offers a cover card, and no choices without a deck', () => {
    expect(coverChoices(DECK, []).map((c) => c.lookId)).not.toContain('killer');
    expect(coverChoices([], [])).toEqual([]);
  });
});

describe('cover picker model', () => {
  it('preselects the first hint and sends a click as one pick', () => {
    const sent: string[] = [];
    const model = createCoverModel(cover(), (lookId) => sent.push(lookId));
    expect(model.choices().find((c) => c.picked)?.lookId).toBe('baker');
    expect(model.pick('baker')).toBe(false); // already picked: nothing to send
    expect(model.pick('vicar')).toBe(true);
    expect(model.choices().find((c) => c.picked)?.lookId).toBe('vicar');
    expect(model.pick('killer')).toBe(false); // not on the list
    expect(sent).toEqual(['vicar']);
  });

  it('marks and disables the look a mate wears, by name, and refuses its click', () => {
    const sent: string[] = [];
    const model = createCoverModel(cover(), (lookId) => sent.push(lookId));
    model.sync({ look: 'baker', mates: { mate: 'lamplighter' } });
    expect(model.choices().find((c) => c.lookId === 'lamplighter')?.wornBy).toBe('Moss');
    expect(model.choices().filter((c) => c.wornBy !== null)).toHaveLength(1);
    expect(model.pick('lamplighter')).toBe(false);
    expect(sent).toEqual([]);
  });

  it("follows the server's pick over the local one", () => {
    const model = createCoverModel(cover());
    model.pick('vicar');
    model.sync({ look: 'doctor', mates: {} });
    expect(model.choices().find((c) => c.picked)?.lookId).toBe('doctor');
  });
});
