import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, effects } from '@wdi/content';
import { ItemStack, slotsIn } from '@wdi/shared';
import { armourOf } from '../src/sim/body/armour';
import { hurt } from '../src/sim/body/damage';
import { applyEffect, tickEffects } from '../src/sim/body/effects';
import { bodySpeedPxPerTick } from '../src/sim/body/run';
import { bodyOf } from '../src/sim/body/state';
import { LAYOUT } from '../src/sim/Inventory';
import { bootNpcServer, pauseClock, standardParty, type Party } from './npcHelpers';

// Round 10 (D6a; GDD 3.33): what the item in the body slot does to its wearer.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

async function party(wear?: string): Promise<{ p: Party; id: string }> {
  const p = await standardParty(colyseus, 'S1');
  pauseClock(p.room);
  const id = p.humans[0]!.id;
  const seat = p.room.state.players.get(id)!;
  seat.priv.inventory.slots.clear();
  if (wear !== undefined) {
    const s = new ItemStack();
    s.defId = wear;
    s.qty = 1;
    s.slot = slotsIn(LAYOUT, 'body')[0]!;
    seat.priv.inventory.slots.push(s);
  }
  return { p, id };
}

const row = (id: string) => balance.armor.items[id]!;

describe('armour', () => {
  it('reads the item in the body slot, and nothing for a seat that wears none', async () => {
    const bare = await party();
    expect(armourOf(bare.p.room, bare.id)).toBeUndefined();
    await colyseus.cleanup();
    const coat = await party('quiltedCoat');
    expect(armourOf(coat.p.room, coat.id)).toEqual(balance.armor.items.quiltedCoat);
  });

  it('slows the drain of a Bleeding with the jerkin and tin mail (clotting), and not with the coat', async () => {
    const lost = async (wear?: string) => {
      const { p, id } = await party(wear);
      const body = bodyOf(p.room, id)!;
      body.hp = 80;
      body.effects.clear();
      applyEffect(p.room, id, body, 'bleeding', 0);
      tickEffects(p.room, id, body);
      const out = 80 - body.hp;
      await colyseus.cleanup();
      return out;
    };
    const bare = await lost();
    expect(bare).toBeCloseTo(effects.effects.bleeding.hpPerS! / 20, 5);
    expect(await lost('leatherJerkin')).toBeCloseTo(bare * row('leatherJerkin').bleedDrainFactor!, 5);
    expect(await lost('quiltedCoat')).toBeCloseTo(bare, 5);
  });

  it('halves the drain of a Poisoned under tin mail', async () => {
    const lost = async (wear?: string) => {
      const { p, id } = await party(wear);
      const body = bodyOf(p.room, id)!;
      body.hp = 80;
      body.effects.clear();
      applyEffect(p.room, id, body, 'poisoned', 0);
      tickEffects(p.room, id, body);
      const out = 80 - body.hp;
      await colyseus.cleanup();
      return out;
    };
    const bare = await lost();
    expect(bare).toBeCloseTo(effects.effects.poisoned.hpPerS! / 20, 5);
    expect(await lost('tinMail')).toBeCloseTo(bare * row('tinMail').poisonDrainFactor!, 5);
  });

  it('slows the walk under tin mail', async () => {
    const speed = async (wear?: string) => {
      const { p, id } = await party(wear);
      const v = bodySpeedPxPerTick(p.room, id, { sprint: false, sneak: false } as never);
      await colyseus.cleanup();
      return v;
    };
    expect(await speed('tinMail')).toBeCloseTo((await speed()) * row('tinMail').speedFactor!, 5);
  });

  it('cuts the damage of a row by the armour, and leaves a bare seat as it was', async () => {
    const taken = async (wear?: string) => {
      const { p, id } = await party(wear);
      const body = bodyOf(p.room, id)!;
      body.hp = body.maxHp;
      hurt(p.room, id, balance.body.damage.strike!, { source: 'strike' });
      const out = body.maxHp - body.hp;
      await colyseus.cleanup();
      return out;
    };
    const bare = await taken();
    expect(bare).toBe(balance.body.damage.strike!.dmg);
    expect(await taken('tinMail')).toBe(Math.round(bare * row('tinMail').damage));
  });

  it('has no knife in the damage table that armour reads (the Knife kills outright, A89)', () => {
    expect(Object.keys(balance.body.damage)).not.toContain('knife');
  });
});
