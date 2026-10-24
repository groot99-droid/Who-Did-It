import type { ColyseusTestServer } from '@colyseus/testing';
import { abilities, balance, mobs } from '@wdi/content';
import { C2S, ErrorCode, Phase, TICK_RATE, TILE_PX, segmentBlocked } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { matchEvents } from '../src/sim/auto/log';
import {
  applyEffect,
  bodyOf,
  creatureHpOf,
  deriveEffects,
  handleBodyAbility,
  hasEffect,
  setBodyRng,
} from '../src/sim/body';
import { AnimId } from '../src/sim/constants';
import { addStack, count } from '../src/sim/Inventory';
import { mobBodies } from '../src/sim/Mobs';
import { MobState } from '../src/sim/mobs/ai';
import { simOf } from '../src/sim/RoomSim';
import { navGrid, sceneKey } from '../src/sim/World';
import { until } from './flowHelpers';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  errors,
  holdPhase,
  lobbyOf,
  pauseClock,
  placeSeat,
  send,
  setRole,
  start,
  toWorld,
} from './npcHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const b = balance.body;
const A = abilities.abilities;
const S = (s: number): number => Math.round(s * TICK_RATE);
const never = (): number => 0.999;

/** Two humans and two NPC seats, every one a Townsfolk, by day, the two humans side by side. */
async function party4(): Promise<Party> {
  const party = await lobbyOf(colyseus, 2);
  for (let i = 0; i < 2; i++) await send(party.humans[0]!, 'lobby.addNpc', {}, 40);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  holdPhase(party, Phase.day, 900);
  setBodyRng(party.room, never);
  const [a, c] = [me(party), other(party)];
  const p = sim(party, c);
  placeSeat(party, a, sceneKey(p.sceneIdx), Math.floor(p.x / TILE_PX) + 1, Math.floor(p.y / TILE_PX));
  advance(party, 1);
  return party;
}
const me = (party: Party): string => party.humans[0]!.id;
const other = (party: Party): string => party.humans[1]!.id;
const sim = (party: Party, id: string) => simOf(party.room).players.get(id)!;
const seat = (party: Party, id: string) => party.room.state.players.get(id)!;
const handleOf = (party: Party, id: string): string => seat(party, id).priv.avatar;
const body = (party: Party, id: string) => bodyOf(party.room, id)!;
const cooldownOf = (party: Party, id: string, ability: string): number =>
  seat(party, id).priv.cooldownEndTick.get(ability) ?? 0;
const ready = (party: Party, id: string, ability: string): void => {
  seat(party, id).priv.cooldownEndTick.set(ability, 0);
};
const act = (party: Party, id: string, abilityId: string, targetId?: string): void =>
  handleBodyAbility(party.room, id, targetId === undefined ? { abilityId } : { abilityId, targetId });
const hits = (room: PartyRoom) => matchEvents(room).filter((e) => e.kind === 'body.hit');

describe('fists (GDD 3.22)', () => {
  it('strikes a seat in reach over the wire: the damage, the stamina, the cooldown, the public swing, body.hit', async () => {
    const party = await party4();
    const [a, c] = [me(party), other(party)];
    await send(party.humans[0]!, C2S.ability, { abilityId: 'strike', targetId: handleOf(party, c) });
    advance(party, 1);
    const tick = party.room.state.tick; // the step that consumed the strike
    expect(body(party, c).hp).toBe(b.maxHp - b.damage.strike.dmg);
    const spent = body(party, a).stamina; // the cost, less the tick's regeneration
    expect(spent).toBeCloseTo(b.maxStamina - b.strikeStamina, 0);
    expect(cooldownOf(party, a, 'strike')).toBe(tick + S(A.strike!.cooldownS!));
    advance(party, 1); // the presence overlay follows the step that landed the blow
    expect(seat(party, a).presence.animId).toBe(AnimId.strike);
    expect(seat(party, c).presence.animId).toBe(AnimId.hurt);
    expect(hits(party.room).at(-1)).toMatchObject({
      seat: c,
      data: { target: c, by: a, source: 'strike', dmg: b.damage.strike.dmg, effects: [] },
    });
    // Again at once: the cooldown refuses it, and nothing moves.
    await send(party.humans[0]!, C2S.ability, { abilityId: 'strike', targetId: handleOf(party, c) });
    advance(party, 1);
    expect(await until(() => errors(party.humans[0]!).length > 0)).toBe(true);
    expect(errors(party.humans[0]!)).toEqual([ErrorCode.cooldown]);
    expect(body(party, c).hp).toBe(b.maxHp - b.damage.strike.dmg);
    // No handle, a stale handle, the own handle, a seat beyond reach: refused, no stamina spent.
    ready(party, a, 'strike');
    const stamina = body(party, a).stamina;
    for (const targetId of [undefined, 'nobody', handleOf(party, a)]) {
      act(party, a, 'strike', targetId);
      expect(body(party, a).stamina).toBe(stamina);
    }
    const p = sim(party, c);
    placeSeat(party, a, sceneKey(p.sceneIdx), Math.floor(p.x / TILE_PX) + 3, Math.floor(p.y / TILE_PX));
    act(party, a, 'strike', handleOf(party, c));
    expect(body(party, a).stamina).toBe(stamina);
    expect(body(party, c).hp).toBe(b.maxHp - b.damage.strike.dmg);
  });

  it('knocks out at zero health, never twice, and a downed seat cannot strike back', async () => {
    const party = await party4();
    const [a, c] = [me(party), other(party)];
    body(party, c).hp = b.damage.strike.dmg;
    act(party, a, 'strike', handleOf(party, c));
    expect(hasEffect(body(party, c), 'knockedOut')).toBe(true);
    expect(sim(party, c).dead).toBe(false);
    ready(party, a, 'strike');
    const stamina = body(party, a).stamina;
    act(party, a, 'strike', handleOf(party, c));
    expect(body(party, a).stamina).toBe(stamina); // refused before the cost
    act(party, c, 'strike', handleOf(party, a));
    expect(body(party, a).hp).toBe(b.maxHp);
  });

  it('a Weakened fist lands half its damage; a Fatigued one waits 1.5 cooldowns', async () => {
    const party = await party4();
    const [a, c] = [me(party), other(party)];
    applyEffect(party.room, a, body(party, a), 'weakened');
    act(party, a, 'strike', handleOf(party, c));
    expect(body(party, c).hp).toBe(b.maxHp - Math.round(b.damage.strike.dmg * 0.5));
    ready(party, a, 'strike');
    body(party, a).stamina = 0;
    deriveEffects(party.room, a, body(party, a));
    expect(hasEffect(body(party, a), 'fatigued')).toBe(true);
    const tick = party.room.state.tick;
    act(party, a, 'strike', handleOf(party, c));
    expect(cooldownOf(party, a, 'strike')).toBe(tick + S(A.strike!.cooldownS! * 1.5));
    expect(body(party, a).stamina).toBe(0);
  });

  it('kills a creature at zero of its health: the flinch, the corpse window, an empty spawner', async () => {
    const party = await party4();
    const a = me(party);
    const room = party.room;
    holdPhase(party, Phase.night, 900);
    advance(party, 1);
    const wolf = [...mobBodies(room).values()].find((m) => m.def.id === 'wolf')!;
    expect(wolf).toBeDefined();
    // Stand on the free tile nearest the wolf, in its sight.
    const grid = navGrid(wolf.site.scene, simOf(room).profile);
    const wx = Math.floor(wolf.x / TILE_PX);
    const wy = Math.floor(wolf.y / TILE_PX);
    let at: { x: number; y: number } | null = null;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (grid.solidAt(wx + dx, wy + dy)) continue;
      if (segmentBlocked(grid, wolf.x, wolf.y, (wx + dx + 0.5) * TILE_PX, (wy + dy + 0.5) * TILE_PX))
        continue;
      at = { x: wx + dx, y: wy + dy };
      break;
    }
    expect(at).not.toBeNull();
    placeSeat(party, a, wolf.site.scene, at!.x, at!.y);
    advance(party, 1);
    expect(creatureHpOf(wolf)).toBe(mobs.mobs.wolf!.hp);
    const blows = Math.ceil(mobs.mobs.wolf!.hp / b.damage.strike.dmg);
    for (let i = 0; i < blows - 1; i++) {
      ready(party, a, 'strike');
      act(party, a, 'strike', wolf.id);
    }
    expect(creatureHpOf(wolf)).toBe(mobs.mobs.wolf!.hp - (blows - 1) * b.damage.strike.dmg);
    const row = () => room.state.scenes.get(wolf.site.scene)!.mobs.get(wolf.id);
    advance(party, 1);
    expect(row()!.animId).toBe(AnimId.hurt); // the flinch rides its row over what Mobs.ts published
    ready(party, a, 'strike');
    act(party, a, 'strike', wolf.id);
    expect(creatureHpOf(wolf)).toBe(0);
    expect(wolf.mind).toMatchObject({ state: MobState.dead, prey: null });
    const hp = body(party, a).hp;
    advance(party, S(5));
    expect(row()).toMatchObject({ state: MobState.dead }); // it lies where it fell
    expect(row()!.animId).not.toBe(AnimId.hurt);
    expect(hits(room).filter((e) => e.data?.target === wolf.id)).toHaveLength(blows);
    expect(hits(room).at(-1)).toMatchObject({ data: { target: wolf.id, by: a, source: 'strike' } });
    expect(body(party, a).hp).toBe(hp); // no bite from a corpse
    expect(sim(party, a).dead).toBe(false);
    ready(party, a, 'strike');
    act(party, a, 'strike', wolf.id); // a corpse is no target
    expect(hits(room).filter((e) => e.data?.target === wolf.id)).toHaveLength(blows);
    advance(party, S(b.creatureCorpseS - 5) + 1);
    expect(row()).toBeUndefined(); // the row goes
    expect(mobBodies(room).get(wolf.id)).toBe(wolf); // and the spawner stands empty until its next waking part
    expect(wolf.mind.state).toBe(MobState.dead);
  });

  it('the Child’s slingshot stuns a seat at range with the item in hand, on its cooldown', async () => {
    const party = await party4();
    const [a, c] = [me(party), other(party)];
    const p = sim(party, c);
    placeSeat(party, a, sceneKey(p.sceneIdx), Math.floor(p.x / TILE_PX) + 3, Math.floor(p.y / TILE_PX));
    act(party, a, 'slingshot', handleOf(party, c)); // a Townsfolk has no slingshot
    expect(body(party, c).hp).toBe(b.maxHp);
    setRole(party.room, a, 'child');
    act(party, a, 'slingshot', handleOf(party, c)); // the card without the item
    expect(body(party, c).hp).toBe(b.maxHp);
    expect(addStack(seat(party, a), 'slingshot', 1)).toBe(true);
    const tick = party.room.state.tick;
    act(party, a, 'slingshot', handleOf(party, c));
    expect(body(party, c).hp).toBe(b.maxHp - b.damage.slingshot.dmg);
    expect(hasEffect(body(party, c), 'stunned')).toBe(true);
    expect(cooldownOf(party, a, 'slingshot')).toBe(tick + S(A.slingshot!.cooldownS!));
    expect(count(seat(party, a), 'slingshot')).toBe(1); // kept
    advance(party, 1);
    expect(hits(party.room).at(-1)).toMatchObject({ data: { target: c, by: a, source: 'slingshot' } });
  });
});

describe('the curing items (GDD 3.22)', () => {
  it('the Medkit heals body.healHp and stops Bleeding, self or in reach, and is never spent for nothing', async () => {
    const party = await party4();
    const [a, c] = [me(party), other(party)];
    expect(addStack(seat(party, a), 'medkit', 1)).toBe(true); // a kit takes a slot each; the Townsfolk has one free
    act(party, a, 'heal'); // whole and clean: nothing to cure
    expect(count(seat(party, a), 'medkit')).toBe(1);
    body(party, c).hp = 50;
    applyEffect(party.room, c, body(party, c), 'bleeding');
    act(party, a, 'heal', handleOf(party, c));
    expect(body(party, c).hp).toBe(50 + b.healHp);
    expect(hasEffect(body(party, c), 'bleeding')).toBe(false);
    expect(count(seat(party, a), 'medkit')).toBe(0);
    expect(addStack(seat(party, a), 'medkit', 1)).toBe(true);
    body(party, a).hp = b.maxHp - 1;
    act(party, a, 'heal');
    expect(body(party, a).hp).toBe(b.maxHp); // capped
    expect(count(seat(party, a), 'medkit')).toBe(0);
  });

  it('Salts (the Doctor) and the Remedy’s antidote cure Poisoned; the Remedy is kept, Salts are spent', async () => {
    const party = await party4();
    const [a, c] = [me(party), other(party)];
    applyEffect(party.room, c, body(party, c), 'poisoned');
    expect(addStack(seat(party, a), 'salts', 1)).toBe(true);
    act(party, a, 'salts', handleOf(party, c)); // not a Doctor
    expect(hasEffect(body(party, c), 'poisoned')).toBe(true);
    setRole(party.room, a, 'doctor');
    act(party, a, 'salts', handleOf(party, c));
    expect(hasEffect(body(party, c), 'poisoned')).toBe(false);
    expect(count(seat(party, a), 'salts')).toBe(0);

    applyEffect(party.room, c, body(party, c), 'poisoned');
    act(party, a, 'antidote', handleOf(party, c)); // no Remedy in hand
    expect(hasEffect(body(party, c), 'poisoned')).toBe(true);
    expect(addStack(seat(party, a), 'remedy', 1)).toBe(true);
    const tick = party.room.state.tick;
    act(party, a, 'antidote', handleOf(party, c));
    expect(hasEffect(body(party, c), 'poisoned')).toBe(false);
    expect(count(seat(party, a), 'remedy')).toBe(1);
    expect(cooldownOf(party, a, 'antidote')).toBe(tick + S(A.antidote!.cooldownS!));
  });

  it('a Wake Loaf cures Famished, Weakened and Fatigued, fills the stamina and plays the eat clip', async () => {
    const party = await party4();
    const a = me(party);
    const room = party.room;
    act(party, a, 'eat'); // nothing in the kit
    expect(addStack(seat(party, a), 'wakeLoaf', 1)).toBe(true);
    const mine = body(party, a);
    mine.stamina = 0;
    mine.lastAteTick = room.state.tick - S(b.famishedAfterS) - 1;
    applyEffect(room, a, mine, 'weakened');
    deriveEffects(room, a, mine);
    expect([...mine.effects.keys()].sort()).toEqual(['famished', 'fatigued', 'weakened']);
    act(party, a, 'eat');
    expect(mine.effects.size).toBe(0);
    expect(mine.stamina).toBe(b.maxStamina);
    expect(count(seat(party, a), 'wakeLoaf')).toBe(0);
    advance(party, 1);
    expect(seat(party, a).presence.animId).toBe(AnimId.eat);
    expect(hasEffect(mine, 'famished')).toBe(false);
    expect(matchEvents(room).filter((e) => e.kind === 'eat')).toEqual([
      expect.objectContaining({ seat: a, data: { seat: a } }),
    ]);
  });

  it('the Doctor’s Bandage also stops Bleeding', async () => {
    const party = await party4();
    const [a, c] = [me(party), other(party)];
    setRole(party.room, a, 'doctor');
    expect(addStack(seat(party, a), 'bandage', 1)).toBe(true);
    applyEffect(party.room, c, body(party, c), 'bleeding');
    await send(party.humans[0]!, C2S.ability, { abilityId: 'bandage', targetId: handleOf(party, c) });
    advance(party, 1);
    expect(hasEffect(body(party, c), 'bleeding')).toBe(false);
    expect(await until(() => errors(party.humans[0]!).length > 0, 300)).toBe(false);
    expect(sim(party, c).bandagedUntilTick).toBeGreaterThan(party.room.state.tick);
  });
});
