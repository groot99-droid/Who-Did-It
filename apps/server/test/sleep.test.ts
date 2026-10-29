import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, scenes, type SceneId } from '@wdi/content';
import { EffectId, EffectState, Phase, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hurt } from '../src/sim/body/damage';
import { addNpcSeat } from '../src/sim/npc/seats';
import { simOf } from '../src/sim/RoomSim';
import { activeSeats, isAsleep } from '../src/sim/Sleep';
import {
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  type Human,
  lobbyOf,
  type Party,
  pauseClock,
  placeSeat,
  start,
  stateOf,
  toWorld,
} from './npcHelpers';
import { sleep } from './simHelpers';

// Round 10, A7 (GDD 3.32; docs/round9/world-mode.md 7.3): beds, who counts, the night skip and what wakes a sleeper.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Two humans and one NPC seat in their first world phase, off the room's clock. */
async function party(): Promise<Party> {
  const p = await lobbyOf(colyseus, 2);
  addNpcSeat(p.room, p.room.seeds.get('npcNames'));
  await start(p);
  await toWorld(p);
  pauseClock(p.room);
  allTownsfolk(p.room);
  advance(p, 1); // the homes are drawn on the first world tick
  return p;
}

const priv = (p: Party, h: Human) => p.room.state.players.get(h.id)!.priv;
const bedIn = (scene: string, kind = 'bed') => scenes[scene as SceneId].props.find((q) => q.kind === kind)!;

/** Stands `h` on the bed of `scene` (a bed is a floor prop) and sends the hold; returns the reasons it was refused. */
async function lieDown(p: Party, h: Human, scene: string, kind = 'bed'): Promise<string[]> {
  const bed = bedIn(scene, kind);
  placeSeat(p, h.id, scene as SceneId, bed.x, bed.y);
  const before = h.log.length;
  h.room.send('act.hold', { action: 'sleep', targetId: bed.id, on: true });
  await sleep(60);
  advance(p, 1);
  await sleep(30);
  return h.log
    .slice(before)
    .filter((m) => m.type === 'error')
    .map((m) => (m.payload as { reason?: string }).reason ?? '');
}

describe('homes and beds', () => {
  it('gives each human a home with a bed of its own, seen by its owner only', async () => {
    const p = await party();
    const [a, b] = p.humans as [Human, Human];
    const homes = [priv(p, a).home, priv(p, b).home];
    for (const home of homes) expect(bedIn(home), home).toBeDefined();
    expect(new Set(homes).size).toBe(2);
    await sleep(200); // the patch reaches the clients
    expect(stateOf(a).players.get(a.id)?.priv?.home).toBe(homes[0]);
    expect(stateOf(b).players.get(a.id)?.priv).toBeUndefined();
  });

  it('lies down at dusk or night only, in the own home bed, never in a boarded one or another seat’s', async () => {
    const p = await party();
    const [a, b] = p.humans as [Human, Human];
    holdPhase(p, Phase.day, 60);
    expect(await lieDown(p, a, priv(p, a).home)).toEqual(['PHASE_CLOSED']);
    holdPhase(p, Phase.dusk, 60);
    expect(await lieDown(p, a, priv(p, b).home)).toEqual(['NO_BED']);
    priv(p, a).body.effects.push(
      Object.assign(new EffectState(), { id: EffectId.indebted, untilTick: 0, stacks: 1 }),
    );
    expect(await lieDown(p, a, priv(p, a).home)).toEqual(['BOARDED_HOME']);
    expect(await lieDown(p, a, 'chapel', 'cot')).toEqual([]); // the cot is free, boarded or not
    expect([isAsleep(p.room, a.id), priv(p, a).asleep]).toEqual([true, true]);
    holdPhase(p, Phase.finalNight, 60);
    advance(p, 1);
    expect(isAsleep(p.room, a.id)).toBe(false); // no sleeping in the Final Night hunt
  });

  it('charges the tavern bed from the purse, and refuses a purse that is short', async () => {
    const p = await party();
    const [a] = p.humans as [Human];
    holdPhase(p, Phase.night, 60);
    const price = balance.sleep.innBedScrip;
    priv(p, a).purse = price - 1;
    expect(await lieDown(p, a, 'tavern_back', 'innBed')).toEqual(['NEED_SCRIP']);
    priv(p, a).purse = price + 3;
    expect(await lieDown(p, a, 'tavern_back', 'innBed')).toEqual([]);
    expect(priv(p, a).purse).toBe(3);
  });
});

describe('the night skip', () => {
  it('counts living, placed, connected humans only: the NPC seat never holds the night open', async () => {
    const p = await party();
    const [a, b] = p.humans as [Human, Human];
    expect(activeSeats(p.room).sort()).toEqual([a.id, b.id].sort());
    holdPhase(p, Phase.night, 200);
    const round = p.room.state.round;
    await lieDown(p, a, priv(p, a).home);
    await lieDown(p, b, priv(p, b).home);
    advance(p, balance.sleep.confirmS * TICK_RATE - 3);
    expect(p.room.state.phase).toBe(Phase.night);
    advance(p, 3);
    expect([p.room.state.phase, p.room.state.round]).toEqual([Phase.day, round + 1]); // the normal dawn
    advance(p, 1); // the day wakes every sleeper
    expect([isAsleep(p.room, a.id), isAsleep(p.room, b.id)]).toEqual([false, false]);
  });

  it('waits while one human is awake, a Killer or anyone, and tells only the sleeper the count', async () => {
    const p = await party();
    const [a, b] = p.humans as [Human, Human];
    holdPhase(p, Phase.night, 200);
    await lieDown(p, a, priv(p, a).home);
    advance(p, 10 * TICK_RATE);
    expect(p.room.state.phase).toBe(Phase.night);
    // "1 of 2 in bed" reaches the sleeper only, with no name; the awake seat reads nothing (PH 13.4).
    expect([priv(p, a).inBed, priv(p, a).inBedOf]).toEqual([1, 2]);
    expect([priv(p, b).inBed, priv(p, b).inBedOf]).toEqual([0, 0]);
  });

  it('wakes on a move, on any other input (refused ASLEEP) and on a hit, after the damage lands', async () => {
    const p = await party();
    const [a] = p.humans as [Human];
    holdPhase(p, Phase.night, 200);
    await lieDown(p, a, priv(p, a).home);
    const at = { x: simOf(p.room).players.get(a.id)!.x, y: simOf(p.room).players.get(a.id)!.y };
    a.room.send('input.move', { seq: 9_000, dx: 1, dy: 0, sprint: false, sneak: false });
    await sleep(60);
    advance(p, 2);
    expect(isAsleep(p.room, a.id)).toBe(false);
    expect(simOf(p.room).players.get(a.id)!.x).toBe(at.x); // the first press wakes, it does not walk

    await lieDown(p, a, priv(p, a).home);
    const before = a.log.length;
    a.room.send('act.bell', {});
    await sleep(60);
    advance(p, 1);
    await sleep(30);
    const reasons = a.log.slice(before).map((m) => (m.payload as { reason?: string }).reason);
    expect([isAsleep(p.room, a.id), reasons]).toEqual([false, ['ASLEEP']]);

    await lieDown(p, a, priv(p, a).home);
    const hp = priv(p, a).body.hp;
    expect(hurt(p.room, a.id, balance.body.damage.strike, { source: 'strike' })).toBe('hurt');
    advance(p, 1);
    expect(isAsleep(p.room, a.id)).toBe(false);
    expect(priv(p, a).body.hp).toBeLessThan(hp);
  });
});
