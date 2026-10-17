import { describe, expect, it } from 'vitest';
import { onubBalance, onubFor, onubRoles, PLAYER_COUNTS } from '../src/index.js';

// ONUB v2 (GDD 3.11): the tables of the GDD, held against roles.onub.json and balance.onub.json.

const counts = PLAYER_COUNTS.map(Number);

/** The cards deck(n) holds beyond deck(n - 1). */
function added(n: number): string[] {
  const prev = [...onubFor(n - 1).deck];
  return onubFor(n).deck.filter((r) => {
    const i = prev.indexOf(r);
    if (i < 0) return true;
    prev.splice(i, 1);
    return false;
  });
}

describe('ONUB v2 decks (GDD 3.11)', () => {
  it('holds the player count plus the Pantry roles at every count', () => {
    for (const n of counts) expect(onubFor(n).deck, `${n}`).toHaveLength(n + onubBalance.pantry.roles);
  });

  it('follows the deck table', () => {
    expect([...onubFor(4).deck].sort()).toEqual(
      ['champignon', 'champignon', 'chef', 'aboyeur', 'sousChef', 'plongeur', 'inspecteur'].sort(),
    );
    expect(added(5)).toEqual(['croissant']);
    expect(added(6)).toEqual(['levain']);
    expect(added(7)).toEqual(['ratDeCave']);
    expect(added(8)).toEqual(['gardeManger']);
    expect(added(9)).toEqual(['boulanger']);
    expect(added(10)).toEqual(['tourrier']);
  });

  it('leaves the Apprenti, the Commis and the Critique to the deck editor', () => {
    for (const n of counts) {
      for (const id of ['apprenti', 'commis', 'critique']) expect(onubFor(n).deck).not.toContain(id);
    }
    for (const id of ['apprenti', 'commis', 'critique']) expect(onubRoles.roles[id]?.ships).toBe('V1');
  });
});

describe('ONUB v2 roles (GDD 3.11)', () => {
  it('has the fifteen roles', () => {
    expect(Object.keys(onubRoles.roles).sort()).toEqual(
      [
        'boulanger',
        'champignon',
        'levain',
        'apprenti',
        'ratDeCave',
        'commis',
        'chef',
        'aboyeur',
        'sousChef',
        'tourrier',
        'plongeur',
        'gardeManger',
        'inspecteur',
        'croissant',
        'critique',
      ].sort(),
    );
  });

  it('makes Le Champignon the only Spore and every Team Mold card a saboteur', () => {
    const roles = Object.values(onubRoles.roles);
    expect(roles.filter((r) => r.spore).map((r) => r.id)).toEqual(['champignon']);
    expect(
      roles
        .filter((r) => r.team === 'mold')
        .map((r) => r.id)
        .sort(),
    ).toEqual(['apprenti', 'champignon', 'levain', 'ratDeCave'].sort());
    for (const r of roles) expect(r.sabotages, r.id).toBe(r.team === 'mold');
    expect(roles.filter((r) => r.team === 'croissant').map((r) => r.id)).toEqual(['croissant']);
    expect(roles.filter((r) => r.onOut === 'dragVote').map((r) => r.id)).toEqual(['critique']);
  });

  it('allows one or two Spores, two Commis or none, one of every other role', () => {
    for (const r of Object.values(onubRoles.roles)) {
      const expected = r.id === 'champignon' ? [1, 2] : r.id === 'commis' ? [2] : [1];
      expect(r.copies, r.id).toEqual(expected);
      expect(r.required, r.id).toBe(r.id === 'champignon');
    }
  });

  it('maps the teams onto the wire factions', () => {
    expect(onubRoles.teams.baker.faction).toBe('village');
    expect(onubRoles.teams.mold.faction).toBe('cabal');
    expect(onubRoles.teams.croissant.faction).toBe('neutral');
  });
});

describe('ONUB v2 stations and cards (GDD 3.11)', () => {
  it('has four stations in overview order, eight good and ten sabotage cards', () => {
    expect(onubBalance.stations.map((s) => s.id)).toEqual(['fridge', 'mixer', 'proofing', 'oven']);
    const cards = Object.values(onubBalance.cards);
    expect(cards.filter((c) => c.kind === 'good')).toHaveLength(8);
    expect(cards.filter((c) => c.kind === 'sabotage')).toHaveLength(10);
  });

  it('weighs the Oven double, flags a lone Mixer card and gives the Proofing Drawer its perk', () => {
    const at = (id: string) => onubBalance.stations.find((s) => s.id === id)!;
    expect(at('oven').weight).toBe(2);
    for (const id of ['fridge', 'mixer', 'proofing']) expect(at(id).weight).toBe(1);
    expect(at('mixer').underMixBelow).toBe(2);
    expect(at('mixer').underMixWeight).toBe(1);
    expect(at('proofing').perk).toBe('peekPantryLoc');
    expect(onubBalance.ruin).toMatchObject({ weight: 3, goodCancels: 1 });
  });

  it('gives only the Thermostat Flip an effect', () => {
    const effects = Object.values(onubBalance.cards).filter((c) => c.effect !== 'none');
    expect(effects.map((c) => [c.id, c.station, c.effect])).toEqual([
      ['thermostat', 'fridge', 'discardRandomOther'],
    ]);
  });
});

describe('ONUB v2 night (GDD 3.11)', () => {
  it('wakes in the GDD order for the GDD seconds', () => {
    expect(onubBalance.windows.map((w) => [w.role, w.seconds])).toEqual([
      ['boulanger', 10],
      ['champignon', 12],
      ['levain', 8],
      ['apprenti', 10],
      ['ratDeCave', 10],
      ['commis', 8],
      ['chef', 12],
      ['aboyeur', 12],
      ['sousChef', 10],
      ['tourrier', 14],
      ['plongeur', 12],
      ['gardeManger', 8],
      ['inspecteur', 8],
    ]);
  });

  it('makes only the Tourrier and the Garde Manger act by seed on timeout', () => {
    const must = onubBalance.windows.filter((w) => w.onTimeout === 'seededPick').map((w) => w.role);
    expect(must).toEqual(['tourrier', 'gardeManger']);
  });

  it('runs the night lengths of GDD 3.11 with the default decks', () => {
    const night = (n: number) => {
      const deck = new Set(onubFor(n).deck);
      const ws = onubBalance.windows.filter((w) => deck.has(w.role));
      return ws.reduce((s, w) => s + w.seconds + onubBalance.timers.fadeS, 0);
    };
    expect(counts.map(night)).toEqual([78, 78, 88, 100, 110, 122, 138]);
  });
});

describe('ONUB v2 vote and winners (GDD 3.11)', () => {
  it('has no Skip, no self-vote and a Pantry target', () => {
    expect(onubBalance.vote).toMatchObject({
      skipAllowed: false,
      selfVoteAllowed: false,
      pantryTarget: true,
      minVotesToTurnOut: 2,
      tiesTurnOutAll: true,
      critiqueHops: 1,
    });
  });

  it('ends with rows that catch every dawn', () => {
    const rows = onubBalance.winners;
    expect(rows.map((r) => r.id)).toEqual([
      'croissantAndBakers',
      'croissant',
      'ruined',
      'sporeOut',
      'sporesHide',
      'cleanTable',
      'moldOut',
      'wrongOven',
    ]);
    expect(rows.at(-3)?.when).toEqual({ anyoneOut: false });
    expect(rows.at(-1)?.when).toEqual({ anyoneOut: true });
  });
});
