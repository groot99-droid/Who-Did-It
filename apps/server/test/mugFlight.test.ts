import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import { bodyOf } from '../src/sim/body/state';
import { TOWN, balanceOf, movePurse } from '../src/sim/economy/purse';
import { onSim, type SimEvent } from '../src/sim/events/bus';
import { npcMemory } from '../src/sim/npc/memory';
import { needsOf } from '../src/sim/npc/needs';
import { simOf } from '../src/sim/RoomSim';
import { type Figure, figuresOf, rehandleFigure } from '../src/sim/townsfolk/figures';
import { handleMug, muggingOf } from '../src/sim/townsfolk/mug';
import { sceneIndex } from '../src/sim/World';
import { openRun } from './killHelpers';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  npcSeats,
  pauseClock,
  placeSeat,
  start,
  toWorld,
} from './npcHelpers';

/**
 * The mugging's Flee and Fight (round 10, S4; GDD 3.24, A180 part two): Flee is a chase that takes the share only if
 * the mugger catches the target; Fight is an exchange of blows on 8A's fists that the target can lose. Nothing of it
 * is on the wire beyond the drawn figures.
 */

/** The cellar is not the hub, is dark by day and has no creature spawner. */
const RUN = openRun('cellar', 6);
const m = balance.moods.mug;
const ticksOf = (s: number) => Math.round(s * TICK_RATE);

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Stands a figure on a tile of a scene and keeps it there (an idle that never ends), under a fresh handle. */
function placeFigure(party: Party, f: Figure, sceneId: 'cellar' | 'overworld', tx: number, ty: number): void {
  f.sceneIdx = sceneIndex(sceneId);
  f.x = (tx + 0.5) * TILE_PX;
  f.y = (ty + 0.5) * TILE_PX;
  f.brain.path = null;
  f.act = {
    kind: 'idle',
    untilTick: Number.POSITIVE_INFINITY,
    station: null,
    goal: { scene: sceneId, x: f.x, y: f.y },
  };
  rehandleFigure(party.room, f);
}

/**
 * 1 human + 3 NPCs by day, every other seat a ghost, one Hungry figure `mugger` in the cellar `apart` tiles from the
 * target (the rest of the townsfolk parked on the overworld), the target carrying a purse of `purse`. The target is
 * the human, or with `npcTarget` one NPC seat held still (the human a ghost on the overworld).
 */
async function world(
  opts: { apart?: number; purse?: number; npcTarget?: boolean } = {},
): Promise<{ party: Party; human: string; target: string; mugger: Figure; heard: SimEvent[] }> {
  const { apart = 4, purse = 30, npcTarget = false } = opts;
  const party = await lobbyOf(colyseus, 1);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  const room = party.room;
  const human = party.humans[0]!.id;
  const target = npcTarget ? npcSeats(room)[0]!.id : human;
  for (const [id, p] of simOf(room).players) p.dead = id !== target;
  holdPhase(party, Phase.day, 3600);
  const figures = [...figuresOf(room).values()];
  const mugger = figures[0]!;
  for (const f of figures.slice(1)) placeFigure(party, f, 'overworld', 2, 2);
  if (npcTarget) {
    placeSeat(party, human, 'overworld', 3, 3);
    npcMemory(room).brain(target).pauseUntilTick = Number.POSITIVE_INFINITY;
  }
  placeSeat(party, target, 'cellar', RUN.x, RUN.y);
  placeFigure(party, mugger, 'cellar', RUN.x + apart, RUN.y);
  needsOf(mugger.brain).hunger = 1;
  // The stake of the look is paid on the first world ticks (8C): then the purse is set to exactly `purse`.
  advance(party, 2);
  movePurse(room, target, TOWN, balanceOf(room, target), 'buy');
  if (purse > 0) movePurse(room, TOWN, target, purse, 'stake');
  const heard: SimEvent[] = [];
  for (const kind of ['mug.start', 'mug.end', 'rob']) onSim(room, kind, (e) => heard.push(e));
  advance(party, 1);
  return { party, human, target, mugger, heard };
}

/** Opens the mugging, runs the threat and leaves the human's prompt open. */
function atPrompt(party: Party, human: string): void {
  for (let i = 0; i < ticksOf(180); i++) {
    advance(party, 1);
    if (muggingOf(party.room, human)) break;
  }
  for (let i = 0; i < ticksOf(m.approachS + m.threatS + 1); i++) {
    advance(party, 1);
    if (muggingOf(party.room, human)?.state === 'prompt') return;
  }
  throw new Error('no prompt');
}

const outcomeOf = (heard: SimEvent[]) => heard.find((e) => e.kind === 'mug.end')?.data?.outcome;

/** Forces an NPC seat's drawn answer by the weights (the draw itself is one uniform on the seat's own stream). */
function npcAnswers(w: { pay: number; flee: number; fight: number }): void {
  Object.assign(m.npcAnswer, w);
}
const npcDefault = { ...m.npcAnswer };
afterEach(() => npcAnswers(npcDefault));

/** Steps until an NPC seat's mugging reaches `state` (the draw is taken when the threat ends). */
function untilState(party: Party, target: string, state: string): boolean {
  for (let i = 0; i < ticksOf(180 + m.approachS + m.threatS + 2); i++) {
    advance(party, 1);
    if (muggingOf(party.room, target)?.state === state) return true;
  }
  return false;
}

describe('the mugging, Flee and Fight (S4)', () => {
  it('an NPC seat target that draws Flee runs from its mugger on the chase path', async () => {
    npcAnswers({ pay: 0, flee: 1, fight: 0 });
    const { party, target, mugger } = await world({ apart: 1, npcTarget: true });
    const room = party.room;
    expect(untilState(party, target, 'chase')).toBe(true);
    // The mugger lags (as a human target gets a head start): the target mid-run, the mugger at its east end.
    placeSeat(party, target, 'cellar', RUN.x + 3, RUN.y);
    placeFigure(party, mugger, 'cellar', RUN.x + 5, RUN.y);
    const p = simOf(room).players.get(target)!;
    const [x0, y0, s0] = [p.x, p.y, p.sceneIdx];
    advance(party, 3);
    const moved = p.sceneIdx !== s0 || Math.hypot(p.x - x0, p.y - y0) > TILE_PX / 8;
    expect(moved).toBe(true);
  });

  it('an NPC seat target that draws Fight stands and trades blows on the exchange path', async () => {
    npcAnswers({ pay: 0, flee: 0, fight: 1 });
    const { party, target, mugger } = await world({ apart: 1, npcTarget: true });
    const room = party.room;
    expect(untilState(party, target, 'fight')).toBe(true);
    advance(party, ticksOf(m.fightHitS) * 2 + 2);
    expect(bodyOf(room, target)!.hp).toBeLessThan(bodyOf(room, target)!.maxHp);
    expect(bodyOf(room, mugger.id)!.hp).toBeLessThan(bodyOf(room, mugger.id)!.maxHp);
  });

  it('Fight trades blows both ways and the mugger gives up at fightS, the purse kept', async () => {
    const { party, human, mugger, heard } = await world({ apart: 1 });
    const room = party.room;
    atPrompt(party, human);
    handleMug(room, human, { choice: 'fight' });
    expect(muggingOf(room, human)?.state).toBe('fight');
    advance(party, ticksOf(m.fightS) + 2);
    expect(muggingOf(room, human)).toBeUndefined();
    expect(outcomeOf(heard)).toBe('escaped');
    expect(bodyOf(room, human)!.hp).toBeLessThan(bodyOf(room, human)!.maxHp);
    expect(bodyOf(room, mugger.id)!.hp).toBeLessThan(bodyOf(room, mugger.id)!.maxHp);
    expect(heard.some((e) => e.kind === 'rob')).toBe(false);
    expect(balanceOf(room, human)).toBe(30);
  });

  it('Fight against a target the blows knock out takes the share', async () => {
    const { party, human, heard } = await world({ apart: 1 });
    const room = party.room;
    atPrompt(party, human);
    bodyOf(room, human)!.hp = 5;
    handleMug(room, human, { choice: 'fight' });
    advance(party, ticksOf(m.fightHitS) + 3);
    expect(outcomeOf(heard)).toBe('taken');
    expect(heard.some((e) => e.kind === 'rob')).toBe(true);
    expect(balanceOf(room, human)).toBeLessThan(30);
  });

  it('Fight against a mugger one blow from a knockout beats it off and never knocks it out', async () => {
    const { party, human, mugger, heard } = await world({ apart: 1 });
    const room = party.room;
    atPrompt(party, human);
    bodyOf(room, mugger.id)!.hp = 3;
    handleMug(room, human, { choice: 'fight' });
    advance(party, 3);
    expect(outcomeOf(heard)).toBe('escaped');
    expect(bodyOf(room, mugger.id)!.hp).toBeLessThan(5); // regen only: no blow landed
    expect(bodyOf(room, mugger.id)!.effects.has('knockedOut')).toBe(false);
    expect(balanceOf(room, human)).toBe(30);
  });

  it('Flee is caught by a mugger within reach and the share is taken', async () => {
    const { party, human, heard } = await world({ apart: 1 });
    const room = party.room;
    atPrompt(party, human);
    handleMug(room, human, { choice: 'flee' });
    expect(muggingOf(room, human)?.state).toBe('chase');
    advance(party, 4);
    expect(outcomeOf(heard)).toBe('taken');
    expect(balanceOf(room, human)).toBe(21);
  });

  it('Flee through a door escapes with the purse whole', async () => {
    const { party, human, heard } = await world({ apart: 4 });
    const room = party.room;
    atPrompt(party, human);
    handleMug(room, human, { choice: 'flee' });
    placeSeat(party, human, 'overworld', 12, 12);
    advance(party, 2);
    expect(outcomeOf(heard)).toBe('escaped');
    expect(balanceOf(room, human)).toBe(30);
  });

  it('a fight the target walks out of turns into a chase', async () => {
    const { party, human } = await world({ apart: 1 });
    const room = party.room;
    atPrompt(party, human);
    handleMug(room, human, { choice: 'fight' });
    simOf(room).players.get(human)!.x += 3 * TILE_PX;
    advance(party, 2);
    expect(muggingOf(room, human)?.state).toBe('chase');
  });
});
