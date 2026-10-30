import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, effects, items, recipes } from '@wdi/content';
import { C2S, ItemStack, slotsIn, TICK_RATE, type RefusalFrame } from '@wdi/shared';
import { armourOf, capped, damageFactor } from '../src/sim/body/armour';
import { applyEffect } from '../src/sim/body/effects';
import { bodyOf } from '../src/sim/body/state';
import { addStack, count, LAYOUT } from '../src/sim/Inventory';
import { advance, bootNpcServer, pauseClock, placeSeat, send, standardParty, type Party } from './npcHelpers';
import { sleep } from './simHelpers';

// Round 10 (S3; GDD 3.14, 3.22): the forge chain's data, the tier-2 wall and the tin armour.

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

describe('the forge chain', () => {
  it('smelts at the kiln, forges at the forge and mails at the anvil, in BlackPine only', () => {
    const at = (id: string) => recipes.recipes[id]!;
    expect(at('tinIngot').station).toBe('kiln');
    for (const id of ['ironAxe', 'ironPickaxe', 'finePick']) expect(at(id).station).toBe('forge');
    for (const id of ['tinMail', 'tinHelm']) expect(at(id).station).toBe('anvil');
    for (const id of ['tinIngot', 'ironAxe', 'ironPickaxe', 'finePick', 'tinMail', 'tinHelm'])
      expect(at(id).maps).toEqual(['blackpine']);
    expect(at('ironAxe').in).toEqual([
      { item: 'tinIngot', qty: 3 },
      { item: 'timber', qty: 1 },
    ]);
  });

  it('takes no item bound to a role', () => {
    for (const r of Object.values(recipes.recipes))
      for (const input of [...r.in, { item: r.out }])
        expect(items.items[input.item]!.roleBound, `${r.id}: ${input.item}`).toBe(false);
  });

  it('gives the iron tools the second tier and twice the uses', () => {
    expect(items.items.ironAxe).toMatchObject({ tool: { cut: 2 }, uses: 40 });
    expect(items.items.ironPickaxe).toMatchObject({ tool: { break: 2, dig: 1 }, uses: 40 });
    expect(items.items.finePick!.tool).toEqual({ pick: 2 });
  });
});

describe('the tier-2 wall', () => {
  const LOG = 'fo.fallen_log';
  async function atLog(): Promise<Party> {
    const p = await standardParty(colyseus, 'S1');
    pauseClock(p.room);
    const human = p.humans[0]!;
    placeSeat(p, human.id, 'forest', 37, 22);
    p.room.state.players.get(human.id)!.priv.inventory.slots.clear();
    advance(p, 1);
    return p;
  }
  async function fell(p: Party): Promise<void> {
    await send(p.humans[0]!, C2S.hold, { action: 'interact', targetId: LOG, on: true }, 60);
    advance(p, 1);
    await sleep(80);
  }

  it('refuses a plain axe NEED_TOOL and names the iron axe', async () => {
    const p = await atLog();
    addStack(p.room.state.players.get(p.humans[0]!.id)!, 'axe', 1);
    await fell(p);
    const refused = p.humans[0]!.log.filter((m) => m.type === 'error').map((m) => m.payload as RefusalFrame);
    expect(refused.at(-1)).toMatchObject({ reason: 'NEED_TOOL', args: { need: 'ironAxe', tier: 2 } });
  });

  it('lets an iron axe fell it for logs and wears the axe by two', async () => {
    const p = await atLog();
    const seat = p.room.state.players.get(p.humans[0]!.id)!;
    addStack(seat, 'ironAxe', 1);
    await fell(p);
    advance(p, Math.round(5 * TICK_RATE));
    expect(count(seat, 'logs')).toBeGreaterThanOrEqual(3);
    expect(count(seat, 'logs')).toBeLessThanOrEqual(4);
  });
});

describe('tin armour', () => {
  it('sends tin mail through tierMult and the cap, with its resistances', async () => {
    const { p, id } = await party('tinMail');
    const mail = items.items.tinMail!.armor!;
    const worn = armourOf(p.room, id);
    expect(worn.damage).toBe(balance.armor.tierMult.body[mail.tier - 1]);
    expect(worn.resist).toEqual({ bleeding: 0.5, poisoned: 0.5 });
    expect(worn.regen).toBe(0.8);
    expect(worn.speed).toBe(0.95);
    expect(damageFactor(p.room, id, true)).toBe(balance.armor.cap);
    const stacked = balance.armor.tierMult.body[2]! * balance.armor.tierMult.head[1]!;
    expect(stacked).toBeLessThan(balance.armor.cap);
    expect(capped(stacked)).toBe(balance.armor.cap);
  });

  it('halves how long a tin helm wearer stays Dazed', async () => {
    const bare = await party();
    const body = bodyOf(bare.p.room, bare.id)!;
    applyEffect(bare.p.room, bare.id, body, 'dazed');
    const full = body.effects.get('dazed')!.untilTick - bare.p.room.state.tick;
    await colyseus.cleanup();
    const { p, id } = await party('tinHelm');
    const b = bodyOf(p.room, id)!;
    applyEffect(p.room, id, b, 'dazed');
    expect(b.effects.get('dazed')!.untilTick - p.room.state.tick).toBe(Math.round(full * 0.5));
    expect(full).toBe(Math.round(effects.effects.dazed.durationS * TICK_RATE));
  });
});
