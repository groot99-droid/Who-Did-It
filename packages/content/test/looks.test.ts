import { describe, expect, it } from 'vitest';
import {
  abilities,
  balance,
  content,
  deckFor,
  items,
  lookOf,
  looks,
  LooksFile,
  PLAYER_COUNTS,
  roles,
  validateContent,
  type Content,
} from '../src/index.js';

// Round-5 pre-seed (deck/data.md): the main deck, the cover roles, the professions and the look catalogue.

function broken(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy);
}

const killers = (cards: readonly string[]) =>
  cards.filter((id) => roles.roles[id]?.abilities.includes('kill')).length;

describe('looks.json (GDD 3.17)', () => {
  it('holds 13 looks: 10 world characters and 3 portrait-only cover cards', () => {
    const all = Object.values(looks.looks);
    expect(all).toHaveLength(13);
    expect(all.filter((l) => l.bodyAtlas !== null)).toHaveLength(10);
    expect(
      all
        .filter((l) => l.bodyAtlas === null)
        .map((l) => l.id)
        .sort(),
    ).toEqual(['accomplice', 'drifter', 'killer']);
    expect(all.filter((l) => l.profession).map((l) => l.id)).toEqual([
      'lamplighter',
      'baker',
      'fisher',
      'tinner',
    ]);
  });

  it('renders the swing and interact clips with the scarf and blood passes', () => {
    expect(looks.clips).toEqual(['idle', 'walk', 'swing', 'interact', 'die']);
    expect(looks.passes).toEqual(['scarf', 'blood']);
  });

  it('keys every look by an atlas-safe id and names its portrait and atlases after it', () => {
    for (const [key, look] of Object.entries(looks.looks)) {
      expect(key).toBe(look.id);
      expect(look.id).toMatch(/^[a-z][a-z0-9]*$/);
      expect(look.portrait).toBe(`portrait_${look.id}`);
      if (look.bodyAtlas !== null) {
        expect(look.bodyAtlas).toBe(`char_${look.id}`);
        expect(look.overlayAtlas).toBe(`ovl_${look.id}`);
      } else expect(look.overlayAtlas).toBeNull();
    }
  });

  it('pairs each look with exactly one role, and gives a world character only to a non-cover card', () => {
    for (const look of Object.values(looks.looks)) {
      const role = roles.roles[look.role];
      expect(role?.look).toBe(look.id);
      expect(look.bodyAtlas === null).toBe(role?.cover === true);
      expect(lookOf(look.role)).toEqual(look);
    }
    expect(lookOf('townsfolk')).toBeNull();
    expect(lookOf('butler')).toBeNull();
    expect(lookOf('nobody')).toBeNull();
  });

  it('keeps the scarf the one saturated colour on a walking figure', () => {
    for (const look of Object.values(looks.looks)) {
      if (look.bodyAtlas === null) continue;
      expect(['ink', 'slate', 'fog', 'bone']).toContain(look.palette.base);
      expect(['ink', 'slate', 'fog', 'bone']).toContain(look.palette.second);
      expect(['mustard', 'lantern', 'bone']).toContain(look.palette.accent);
    }
  });

  it('rejects an unknown clip and a look id that is not atlas-safe', () => {
    const raw = structuredClone(looks);
    expect(LooksFile.safeParse({ ...raw, clips: [...raw.clips, 'dance'] }).success).toBe(false);
    const bad = structuredClone(raw);
    bad.looks.baker!.id = 'Baker_1';
    expect(LooksFile.safeParse(bad).success).toBe(false);
  });
});

describe('decks (GDD 3.1, 3.9)', () => {
  it('lists player count + 2 cards at every size, with the practice party at 4', () => {
    for (const n of PLAYER_COUNTS) {
      const deck = deckFor(Number(n));
      expect(deck.cards).toHaveLength(Number(n) + 2);
      expect(deck.practice).toBe(n === '4');
    }
  });

  it('deals only shipped cards with a look, never the Townsfolk class row', () => {
    for (const n of PLAYER_COUNTS) {
      for (const id of deckFor(Number(n)).cards) {
        expect(roles.roles[id]?.ships).toBe('V1');
        expect(lookOf(id)).not.toBeNull();
        expect(id).not.toBe('townsfolk');
      }
    }
  });

  it('holds one Killer card below 10 and two at 10, at most two cover cards, no shared non-cover look', () => {
    for (const n of PLAYER_COUNTS) {
      const { cards } = deckFor(Number(n));
      expect(killers(cards)).toBe(n === '10' ? 2 : 1);
      expect(cards.filter((id) => roles.roles[id]?.cover === true).length).toBeLessThanOrEqual(2);
      const plain = cards.filter((id) => roles.roles[id]?.cover !== true);
      expect(new Set(plain).size).toBe(plain.length);
    }
  });

  it('leaves every cover seat at least one undealt non-cover card to wear (GDD 3.17)', () => {
    for (const n of PLAYER_COUNTS) {
      const { cards } = deckFor(Number(n));
      const covers = cards.filter((id) => roles.roles[id]?.cover === true).length;
      const plain = cards.filter((id) => roles.roles[id]?.cover !== true).length;
      // Two cards stay undealt; a cover seat wears one of them, so the deck has a non-cover card per cover card.
      expect(plain).toBeGreaterThanOrEqual(covers);
    }
  });

  it('puts every look of the catalogue in some deck (no orphan art)', () => {
    const dealt = new Set(PLAYER_COUNTS.flatMap((n) => deckFor(Number(n)).cards));
    for (const look of Object.values(looks.looks)) expect(dealt.has(look.role)).toBe(true);
  });

  it('keeps the roster rows beside the decks until the contract phase (DECISIONS X1)', () => {
    expect(roles.standIn).toBe('townsfolk');
    for (const n of PLAYER_COUNTS) expect(roles.rosters[n].deal).toHaveLength(Number(n));
  });
});

describe('the round-5 roles, abilities and balance rows', () => {
  it('marks exactly the Killer, the Accomplice and the Drifter as cover roles', () => {
    const covers = Object.values(roles.roles)
      .filter((r) => r.cover === true)
      .map((r) => r.id)
      .sort();
    expect(covers).toEqual(['accomplice', 'drifter', 'killer']);
  });

  it('copies every rules field of the Townsfolk into each profession', () => {
    const tf = roles.roles.townsfolk!;
    for (const id of ['lamplighter', 'baker', 'fisher', 'tinner']) {
      const p = roles.roles[id]!;
      expect(p.plays).toBe('townsfolk');
      for (const field of ['faction', 'goal', 'win', 'winsWith', 'parity', 'beware', 'bellPulls'] as const)
        expect(p[field]).toEqual(tf[field]);
      expect(p.startKit).toEqual(tf.startKit);
      expect(p.abilities).toEqual(tf.abilities);
    }
  });

  it('gives the night roles their seat-targeted night powers and kits', () => {
    expect(roles.roles.vicar?.abilities).toEqual(['confession']);
    expect(roles.roles.watchman?.abilities).toEqual(['keepWatch']);
    expect(roles.roles.herbalist?.abilities).toEqual(['remedy', 'poison']);
    expect(roles.roles.gamekeeper?.abilities).toEqual(['lastShot']);
    for (const id of ['confession', 'keepWatch', 'remedy', 'poison']) {
      const ab = abilities.abilities[id]!;
      expect(ab.target).toBe('seat');
      expect(ab.nightPower).toBe(true);
      expect(ab.phases).toEqual(['dusk', 'night', 'finalNight']);
    }
    expect(abilities.abilities.remedy?.allowSelf).toBe(true);
    for (const id of ['remedy', 'nightshade', 'fowlingPiece']) expect(items.items[id]?.roleBound).toBe(true);
  });

  it('gives the Killer Impersonate in place of the Lock door and keeps the Lock for V1.5', () => {
    expect(roles.roles.killer?.abilities).toEqual(['kill', 'impersonate', 'dragBody']);
    expect(abilities.abilities.impersonate?.target).toBe('seat');
    expect(abilities.abilities.killerLock?.ships).toBe('V1.5');
    expect(abilities.abilities.kill?.phases).toEqual(['dusk', 'night', 'finalNight']);
    expect(abilities.abilities.bell?.phases).toEqual(['grace', 'day']);
  });

  it('carries the Impersonate and night-power sections in balance.json', () => {
    expect(Object.keys(balance.impersonate).sort()).toEqual([
      'applyWindowS',
      'cooldownS',
      'durationS',
      'gddRef',
    ]);
    expect(balance.nightPowers.perNight).toBeGreaterThan(0);
    expect(balance.finalNight.reportEndsHunt).toBe(true);
    expect(balance.hunger.trailEveryS).toBeGreaterThan(0);
    expect(balance.noise.shot).toBeGreaterThan(0);
  });
});

describe('validateContent rejects (round 5)', () => {
  it('a Village cover role', () => {
    expect(
      broken((c) => {
        c.roles.roles.detective!.cover = true;
      }),
    ).toEqual(
      expect.arrayContaining([expect.stringContaining('detective: a cover role is Cabal or Neutral')]),
    );
  });

  it('a deck row of the wrong size and a deck with no Killer', () => {
    expect(
      broken((c) => {
        c.roles.decks['6'].cards.pop();
        c.roles.decks['5'].cards[0] = 'fisher';
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('deck 6: has 7 cards, expected 8'),
        expect.stringContaining('deck 5: no card holds kill'),
      ]),
    );
  });

  it('a repeated non-Killer card and the class row in a deck', () => {
    expect(
      broken((c) => {
        c.roles.decks['7'].cards[8] = 'baker';
        c.roles.decks['8'].cards[9] = 'townsfolk';
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('deck 7: baker appears 2 times'),
        expect.stringContaining('deck 8: lists the class row townsfolk'),
      ]),
    );
  });

  it('a profession whose rules differ from its class row', () => {
    expect(
      broken((c) => {
        c.roles.roles.baker!.bellPulls = 3;
      }),
    ).toEqual(expect.arrayContaining([expect.stringContaining("baker: bellPulls differs from townsfolk's")]));
  });

  it('a world character with a blood accent and a cover card with a body', () => {
    expect(
      broken((c) => {
        c.looks.looks.vicar!.palette.accent = 'blood';
        c.looks.looks.killer!.bodyAtlas = 'char_killer';
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('look vicar: accent from mustard, lantern, bone'),
        expect.stringContaining('look killer: bodyAtlas must be null'),
      ]),
    );
  });

  it('a night power that works in the day or names a figure', () => {
    expect(
      broken((c) => {
        c.abilities.abilities.confession!.phases = ['day'];
        c.abilities.abilities.poison!.target = 'player';
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ability confession: a night power works only at dusk'),
        expect.stringContaining('ability poison: a night power targets a seat'),
      ]),
    );
  });
});
