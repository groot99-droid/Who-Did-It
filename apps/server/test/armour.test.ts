import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, effects, items } from '@wdi/content';
import { ItemStack, slotsIn } from '@wdi/shared';
import { armourOf, capped, damageFactor } from '../src/sim/body/armour';
import { hurt } from '../src/sim/body/damage';
import { applyEffect, tickEffects } from '../src/sim/body/effects';
import { bodyOf } from '../src/sim/body/state';
import { tiersOf } from '../src/sim/economy/perks';
import { LAYOUT } from '../src/sim/Inventory';
import { bootNpcServer, pauseClock, standardParty, type Party } from './npcHelpers';

// Round 10 (D6a; GDD 3.33): what the item in the body slot does to its wearer.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

async function party(...wear: string[]): Promise<{ p: Party; id: string }> {
  const p = await standardParty(colyseus, 'S1');
  pauseClock(p.room);
  const id = p.humans[0]!.id;
  const seat = p.room.state.players.get(id)!;
  seat.priv.inventory.slots.clear();
  for (const defId of wear) {
    const s = new ItemStack();
    s.defId = defId;
    s.qty = 1;
    s.slot = slotsIn(LAYOUT, items.items[defId]!.equip as 'body' | 'head')[0]!;
    seat.priv.inventory.slots.push(s);
  }
  return { p, id };
}

const armor = (id: string) => items.items[id]!.armor!;
const tier = (slot: 'body' | 'head', id: string) => balance.armor.tierMult[slot][armor(id).tier - 1]!;

async function bleedLoss(wear?: string): Promise<number> {
  const { p, id } = await party(...(wear ? [wear] : []));
  const body = bodyOf(p.room, id)!;
  body.hp = 80;
  body.effects.clear();
  applyEffect(p.room, id, body, 'bleeding', 0);
  tickEffects(p.room, id, body);
  const out = 80 - body.hp;
  await colyseus.cleanup();
  return out;
}

async function strikeLoss(
  wear: string[],
  row = balance.body.damage.strike!,
  source = 'strike',
): Promise<number> {
  const { p, id } = await party(...wear);
  const body = bodyOf(p.room, id)!;
  body.hp = body.maxHp;
  hurt(p.room, id, row, { source });
  const out = body.maxHp - body.hp;
  await colyseus.cleanup();
  return out;
}

describe('armour', () => {
  it('reads the body slot, and a bare seat gets nothing', async () => {
    const bare = await party();
    expect(armourOf(bare.p.room, bare.id)).toEqual({ damage: 1, resist: {}, regen: 1, speed: 1 });
    await colyseus.cleanup();
    const coat = await party('quiltedCoat');
    expect(armourOf(coat.p.room, coat.id).damage).toBe(tier('body', 'quiltedCoat'));
  });

  it('halves the Bleeding drain in the jerkin, and not in the coat', async () => {
    const bare = await bleedLoss();
    expect(bare).toBeCloseTo(effects.effects.bleeding.hpPerS! / 20, 5);
    expect(await bleedLoss('leatherJerkin')).toBeCloseTo(bare * armor('leatherJerkin').resist!.bleeding!, 5);
    expect(await bleedLoss('quiltedCoat')).toBeCloseTo(bare, 5);
  });

  it('tires the jerkin wearer: slower stamina regeneration', async () => {
    const { p, id } = await party('leatherJerkin');
    expect(armourOf(p.room, id).regen).toBe(armor('leatherJerkin').staminaRegenMult);
  });

  it('cuts the damage of a row by the tier, and leaves a bare seat as it was', async () => {
    const bare = await strikeLoss([]);
    expect(bare).toBe(balance.body.damage.strike!.dmg);
    expect(await strikeLoss(['quiltedCoat'])).toBe(Math.round(bare * tier('body', 'quiltedCoat')));
    expect(await strikeLoss(['leatherJerkin'])).toBe(Math.round(bare * tier('body', 'leatherJerkin')));
  });

  it('holds the stack of factors at the cap: body, head and the Lodge perk never take more than half', () => {
    const stacked = tier('body', 'leatherJerkin') * balance.armor.tierMult.head[1]! * 0.8;
    expect(stacked).toBeLessThan(balance.armor.cap);
    expect(capped(stacked)).toBe(balance.armor.cap);
    expect(capped(0.9)).toBe(0.9);
    expect(capped(1.3)).toBe(1);
  });

  it('applies a creature bite through the same factor, and a bare seat takes it whole', async () => {
    const { p, id } = await party('leatherJerkin');
    expect(damageFactor(p.room, id, true)).toBe(tier('body', 'leatherJerkin'));
    await colyseus.cleanup();
    const bare = await party();
    expect(damageFactor(bare.p.room, bare.id, true)).toBe(1);
  });

  it("cuts a creature's bite by the Lodge perk and a guard's blow by the armour only", async () => {
    const { p, id } = await party('quiltedCoat');
    const seat = p.room.state.players.get(id)!;
    seat.look = 'gamekeeper';
    tiersOf(p.room).set('lodge', 3);
    const body = bodyOf(p.room, id)!;
    const row = balance.body.damage.strike!;
    const taken = (hit: { source: string; cause?: 'creature' }): number => {
      body.hp = body.maxHp;
      hurt(p.room, id, row, hit);
      return body.maxHp - body.hp;
    };
    expect(taken({ source: 'guard' })).toBe(Math.round(row.dmg * tier('body', 'quiltedCoat')));
    expect(taken({ source: 'wolf', cause: 'creature' })).toBe(
      Math.round(row.dmg * Math.max(balance.armor.cap, tier('body', 'quiltedCoat') * 0.8)),
    );
  });

  it('keeps no Knife in the damage table that armour reads (the Knife kills outright, A89)', () => {
    expect(Object.keys(balance.body.damage)).not.toContain('knife');
  });
});
