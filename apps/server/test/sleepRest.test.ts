import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, economy, scenes, type SceneId } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyEffect, hasEffect } from '../src/sim/body/effects';
import { bodyOf } from '../src/sim/body/state';
import { isAsleep } from '../src/sim/Sleep';
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
  setRole,
  start,
  stateOf,
  toWorld,
} from './npcHelpers';
import { sleep } from './simHelpers';

// Round 10, A7b (GDD 3.32; docs/round9/world-mode.md 7.3, followup-4.md 2.11): what each bed restores at dawn, and
// Exhaustion for the last one awake.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const GRACE = Math.round(balance.sleep.holdoutGraceS * TICK_RATE);

/** Two humans in their first world phase, off the room's clock, both on a card without a night power. */
async function party(): Promise<Party> {
  const p = await lobbyOf(colyseus, 2);
  await start(p);
  await toWorld(p);
  pauseClock(p.room);
  allTownsfolk(p.room);
  advance(p, 1);
  return p;
}

const priv = (p: Party, h: Human) => p.room.state.players.get(h.id)!.priv;
const body = (p: Party, h: Human) => bodyOf(p.room, h.id)!;

/** Stands `h` on the bed of `scene` and lies down. */
async function lieDown(p: Party, h: Human, scene: string, kind = 'bed'): Promise<void> {
  const bed = scenes[scene as SceneId].props.find((q) => q.kind === kind)!;
  placeSeat(p, h.id, scene as SceneId, bed.x, bed.y);
  h.room.send('act.hold', { action: 'sleep', targetId: bed.id, on: true });
  await sleep(60);
  advance(p, 1);
  expect(isAsleep(p.room, h.id), `${h.id} in ${bed.id}`).toBe(true);
}

/** The night turns to day: one tick to see the dawn. */
function dawn(p: Party): void {
  holdPhase(p, Phase.day, 600);
  advance(p, 1);
}

describe('what a night in bed restores', () => {
  it('fills the stamina at a home bed and clears nothing; waking in the night restores nothing', async () => {
    const p = await party();
    const [a, b] = p.humans as [Human, Human];
    holdPhase(p, Phase.night, 600);
    await lieDown(p, a, priv(p, a).home);
    await lieDown(p, b, priv(p, b).home);
    body(p, a).stamina = 10;
    body(p, b).stamina = 10;
    applyEffect(p.room, a.id, body(p, a), 'slowed');
    b.room.send('input.move', { seq: 9_000, dx: 1, dy: 0, sprint: false, sneak: false });
    await sleep(60);
    advance(p, 1);
    expect(isAsleep(p.room, b.id)).toBe(false);
    dawn(p);
    expect(body(p, a).stamina).toBe(body(p, a).maxStamina);
    expect(hasEffect(body(p, a), 'slowed')).toBe(true);
    expect(body(p, b).stamina).toBeLessThan(body(p, b).maxStamina / 2);
  });

  it('cures Slowed, Stunned, Poisoned and Famished at the tavern bed, and Famished stays cured', async () => {
    const p = await party();
    const [a] = p.humans as [Human];
    holdPhase(p, Phase.night, 600);
    priv(p, a).purse = balance.sleep.innBedScrip;
    await lieDown(p, a, 'tavern_back', 'innBed');
    for (const id of ['slowed', 'stunned', 'poisoned', 'famished'] as const)
      applyEffect(p.room, a.id, body(p, a), id, 0);
    body(p, a).lastAteTick = -10 * balance.body.famishedAfterS * TICK_RATE;
    dawn(p);
    advance(p, TICK_RATE);
    for (const id of balance.sleep.innBedCures) expect(hasEffect(body(p, a), id), id).toBe(false);
    expect(body(p, a).stamina).toBe(body(p, a).maxStamina);
  });

  it('brings the stamina up to half at the chapel cot, never down, and gives its Faith', async () => {
    const p = await party();
    const [a, b] = p.humans as [Human, Human];
    holdPhase(p, Phase.night, 600);
    await lieDown(p, a, 'chapel', 'cot');
    await lieDown(p, b, 'chapel', 'cot');
    body(p, a).stamina = 0;
    body(p, b).stamina = 90;
    priv(p, a).faith = economy.faith.max - 1;
    priv(p, b).faith = 0;
    dawn(p);
    expect(body(p, a).stamina).toBeGreaterThanOrEqual(body(p, a).maxStamina * balance.sleep.restore.cot);
    expect(body(p, b).stamina).toBeGreaterThanOrEqual(90);
    expect([priv(p, a).faith, priv(p, b).faith]).toEqual([economy.faith.max, balance.sleep.cotFaith]);
  });
});

describe('Exhaustion', () => {
  it('halves the last holdout’s maximum stamina and regeneration from dawn to dusk, privately', async () => {
    const p = await party();
    const [a, b] = p.humans as [Human, Human];
    holdPhase(p, Phase.night, 600);
    await lieDown(p, a, priv(p, a).home);
    advance(p, GRACE + 1);
    dawn(p);
    expect(hasEffect(body(p, b), 'exhausted')).toBe(true);
    expect(hasEffect(body(p, a), 'exhausted')).toBe(false);
    advance(p, 1); // the body stage, which runs before the phases, sets the cap on the next tick
    expect(body(p, b).maxStamina).toBe(balance.body.maxStamina / 2);
    expect(body(p, b).stamina).toBeLessThanOrEqual(body(p, b).maxStamina);
    body(p, a).stamina = 0;
    body(p, b).stamina = 0;
    advance(p, TICK_RATE);
    expect(body(p, b).stamina).toBeCloseTo(body(p, a).stamina / 2, 5);
    await sleep(200); // the patch reaches the clients
    expect(stateOf(b).players.get(b.id)?.priv?.body.maxStamina).toBe(balance.body.maxStamina / 2);
    expect(stateOf(a).players.get(b.id)?.priv).toBeUndefined();
    holdPhase(p, Phase.dusk, 600);
    advance(p, 2);
    expect(hasEffect(body(p, b), 'exhausted')).toBe(false);
    expect(body(p, b).maxStamina).toBe(balance.body.maxStamina);
  });

  it('spares a holdout who went to bed within the grace, and a card with a night power', async () => {
    const p = await party();
    const [a, b] = p.humans as [Human, Human];
    holdPhase(p, Phase.night, 600);
    await lieDown(p, a, priv(p, a).home);
    advance(p, GRACE - 10);
    await lieDown(p, b, priv(p, b).home);
    dawn(p);
    expect(hasEffect(body(p, b), 'exhausted')).toBe(false);

    setRole(p.room, b.id, 'watchman'); // keepWatch works in the night
    holdPhase(p, Phase.night, 600);
    advance(p, 1);
    await lieDown(p, a, priv(p, a).home);
    advance(p, GRACE + 1);
    dawn(p);
    expect(hasEffect(body(p, b), 'exhausted')).toBe(false);
  });
});
