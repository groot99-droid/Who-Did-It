import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { ClueKind, Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import { avatarOf } from '../src/sim/Avatars';
import { runInvariants } from '../src/sim/auto/invariants';
import { AnimId } from '../src/sim/constants';
import { TOWN, balanceOf, movePurse } from '../src/sim/economy/purse';
import { onSim, type SimEvent } from '../src/sim/events/bus';
import { npcMemory } from '../src/sim/npc/memory';
import { needsOf } from '../src/sim/npc/needs';
import { simOf } from '../src/sim/RoomSim';
import { type Figure, figuresOf, rehandleFigure } from '../src/sim/townsfolk/figures';
import {
  type MugFactors,
  aloneTarget,
  figureAccount,
  handleMug,
  mugChance,
  muggingOf,
} from '../src/sim/townsfolk/mug';
import { sceneIndex, tileCentre } from '../src/sim/World';
import { until } from './flowHelpers';
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
 * The mugging (round 8, GDD 3.24, docs/round8/townsfolk.md 3 and 4; Session 8E): the roll rises with the purse band
 * and the mood and is zero with company or a lit light; the walk-up, the threat and the prompt; Pay, the silent
 * take and the escape through a door (Flee and Fight are part two, A180); the cooldown; nothing of it on the wire.
 */

/** The cellar is not the hub, is dark by day and has no creature spawner. */
const RUN = openRun('cellar', 6);
const m = balance.moods.mug;
const ticksOf = (s: number) => Math.round(s * TICK_RATE);
const figureNotSeat = (party: Party) => runInvariants(party.room).filter((f) => f.name === 'figureNotSeat');

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

/** Steps until a mugging of `human` is under way, within `maxS` seconds; returns whether one started. */
function untilMugged(party: Party, human: string, maxS = 180): boolean {
  for (let i = 0; i < ticksOf(maxS); i++) {
    advance(party, 1);
    if (muggingOf(party.room, human)) return true;
  }
  return false;
}

/** Steps until the human's prompt is open. */
function untilPrompt(party: Party, human: string): void {
  for (let i = 0; i < ticksOf(m.approachS + m.threatS + 1); i++) {
    advance(party, 1);
    if (muggingOf(party.room, human)?.state === 'prompt') return;
  }
  throw new Error('no prompt');
}

const BASE: MugFactors = {
  band: 'light',
  strength: 0.6,
  fear: 0,
  night: false,
  weak: false,
  longAlone: false,
  light: false,
};

describe('the mugging roll', () => {
  it('rises with the purse band, the mood, the night, a weak target and a long time alone; falls with fear and a light', () => {
    const light = mugChance(BASE);
    const heavy = mugChance({ ...BASE, band: 'heavy' });
    expect(light).toBeGreaterThan(0);
    expect(heavy).toBeGreaterThan(light);
    expect(mugChance({ ...BASE, strength: 1 })).toBeGreaterThan(light);
    expect(mugChance({ ...BASE, night: true })).toBeCloseTo(light * m.nightMul, 9);
    expect(mugChance({ ...BASE, weak: true })).toBeCloseTo(light * m.weakMul, 9);
    // The long wait counts only beside a heavy purse.
    expect(mugChance({ ...BASE, longAlone: true })).toBe(light);
    expect(mugChance({ ...BASE, band: 'heavy', longAlone: true })).toBeCloseTo(heavy * m.longAloneMul, 9);
    expect(mugChance({ ...BASE, fear: 1 })).toBeLessThan(light);
    expect(mugChance({ ...BASE, light: true })).toBeCloseTo(light * m.lightMul, 9);
    expect(mugChance({ ...BASE, band: 'heavy', strength: 1, night: true, weak: true })).toBeLessThanOrEqual(
      1,
    );
  });

  it('is zero with company (a seat or another figure), in the hub, and for the Watchman look', async () => {
    const { party, human, mugger } = await world();
    const room = party.room;
    const who = {
      id: mugger.id,
      figure: mugger,
      brain: mugger.brain,
      sceneIdx: mugger.sceneIdx,
      x: mugger.x,
      y: mugger.y,
    };
    expect(aloneTarget(room, who)).toBe(human);
    // A second living seat in the scene.
    const other = npcSeats(room)[0]!.id;
    simOf(room).players.get(other)!.dead = false;
    placeSeat(party, other, 'cellar', RUN.x + 1, RUN.y);
    expect(aloneTarget(room, who)).toBeNull();
    simOf(room).players.get(other)!.dead = true;
    expect(aloneTarget(room, who)).toBe(human);
    // Another figure in the scene.
    const bystander = [...figuresOf(room).values()][1]!;
    placeFigure(party, bystander, 'cellar', RUN.x + 2, RUN.y);
    expect(aloneTarget(room, who)).toBeNull();
    placeFigure(party, bystander, 'overworld', 2, 2);
    expect(aloneTarget(room, who)).toBe(human);
    // The look everyone sees is the Watchman's.
    room.state.players.get(human)!.look = 'watchman';
    expect(aloneTarget(room, who)).toBeNull();
    room.state.players.get(human)!.look = '';
    // The hub (the overworld square) is never alone.
    placeSeat(party, human, 'overworld', 3, 3);
    placeFigure(party, mugger, 'overworld', 4, 3);
    expect(aloneTarget(room, { ...who, sceneIdx: mugger.sceneIdx, x: mugger.x, y: mugger.y })).toBeNull();
  });
});

describe('a mugging', () => {
  it('walks up, threatens, prompts the target, and takes the share when the target pays', async () => {
    const { party, human, mugger, heard } = await world();
    const room = party.room;
    expect(untilMugged(party, human)).toBe(true);
    expect(heard.map((e) => e.kind)).toEqual(['mug.start']);
    expect(heard[0]!.data).toEqual({ mugger: mugger.id, target: human });
    expect(muggingOf(room, human)?.state).toBe('approach');
    untilPrompt(party, human);
    // The walk-up ended within reach, the threat played on the avatar, and only the target heard of it.
    const t = simOf(room).players.get(human)!;
    expect(Math.hypot(t.x - mugger.x, t.y - mugger.y)).toBeLessThanOrEqual(m.reachTiles * TILE_PX);
    expect(avatarOf(room, mugger.handle as string)?.animId).toBe(AnimId.threaten);
    const log = party.humans[0]!.log;
    expect(await until(() => log.some((e) => e.type === 'mugPrompt'))).toBe(true);
    const prompt = log.find((e) => e.type === 'mugPrompt')!.payload as { muggerId: string; endsTick: number };
    expect(prompt.muggerId).toBe(mugger.handle);
    expect(prompt.endsTick).toBe(muggingOf(room, human)!.untilTick);
    expect(JSON.stringify(room.state.toJSON())).not.toMatch(/"mug|"scuffle|"folk/);
    // Pay: the share leaves the purse for the figure's account, through 8C's purse, and the mugging ends.
    handleMug(room, human, { choice: 'pay' });
    expect(muggingOf(room, human)).toBeUndefined();
    expect(balanceOf(room, human)).toBe(30 - 9);
    expect(balanceOf(room, figureAccount(mugger.id))).toBe(9);
    // The scuffle lies where the target stood, with the mugger's height (clues.json `scuffle`).
    const scuffle = [...room.state.scenes.get('cellar')!.clues.values()].find(
      (c) => c.kind === ClueKind.scuffle,
    );
    expect(scuffle).toMatchObject({
      value: balance.townsfolk.height,
      x: Math.round(tileCentre(Math.floor(t.x / TILE_PX), TILE_PX)),
      y: Math.round(tileCentre(Math.floor(t.y / TILE_PX), TILE_PX)),
    });
    advance(party, 1); // the bus delivers on the next tick
    expect(heard.slice(1).map((e) => [e.kind, e.data])).toEqual([
      ['rob', { by: mugger.id, target: human, amount: 9 }],
      ['mug.end', { mugger: mugger.id, target: human, outcome: 'paid' }],
    ]);
    expect(avatarOf(room, mugger.handle as string)?.animId).not.toBe(AnimId.threaten);
    expect(figureNotSeat(party)).toEqual([]);
    // Neither side is rolled against again for the cooldown.
    advance(party, ticksOf(m.cooldownS) - 2);
    expect(heard.filter((e) => e.kind === 'mug.start')).toHaveLength(1);
  });

  it('lets a target through a door escape while its answer is due, and pays through the wire', async () => {
    const { party, human, mugger, heard } = await world({ apart: 1 });
    const room = party.room;
    expect(untilMugged(party, human)).toBe(true);
    expect(muggingOf(room, human)?.state).toBe('threat'); // in reach already: no walk-up
    untilPrompt(party, human);
    placeSeat(party, human, 'overworld', 3, 3);
    advance(party, 2);
    expect(heard.at(-1)?.data).toEqual({ mugger: mugger.id, target: human, outcome: 'escaped' });
    expect(balanceOf(room, human)).toBe(30);
    // A second match: the answer comes over the wire (`act.mug`, consumed in the step) and pays.
    const second = await world({ apart: 1 });
    expect(untilMugged(second.party, second.human)).toBe(true);
    untilPrompt(second.party, second.human);
    second.party.humans[0]!.room.send('act.mug', { choice: 'pay' });
    // The clock is paused: each poll runs one step, which consumes the queued command (ARCHITECTURE 5.6).
    expect(
      await until(() => {
        advance(second.party, 1);
        return muggingOf(second.party.room, second.human) === undefined;
      }),
    ).toBe(true);
    advance(second.party, 1);
    expect(second.heard.at(-1)?.data).toMatchObject({ outcome: 'paid' });
    expect(balanceOf(second.party.room, second.human)).toBe(21);
  });

  it('takes the share from a silent target when the answer runs out, and refuses a late, odd, fleeing or fighting answer', async () => {
    const { party, human, mugger, heard } = await world({ apart: 1 });
    const room = party.room;
    expect(untilMugged(party, human)).toBe(true);
    untilPrompt(party, human);
    const errors = () => party.humans[0]!.log.filter((e) => e.type === 'error').length;
    handleMug(room, human, { choice: 'fight' }); // the fists are not in yet (A180 part two)
    handleMug(room, human, { choice: 'flee' }); // nor the chase
    handleMug(room, human, { choice: 'rob' });
    expect(muggingOf(room, human)?.state).toBe('prompt');
    advance(party, ticksOf(m.answerS) + 1);
    expect(heard.at(-1)?.data).toEqual({ mugger: mugger.id, target: human, outcome: 'taken' });
    expect(balanceOf(room, human)).toBe(21);
    handleMug(room, human, { choice: 'pay' }); // no prompt open
    expect(await until(() => errors() === 4)).toBe(true);
  });

  it('never starts on a target with an empty purse, an NPC seat pays at once, and a meeting drops it', async () => {
    const { party, human } = await world({ apart: 1, purse: 0 });
    expect(untilMugged(party, human, 30)).toBe(false);
    // An NPC seat as the target, alone with the figure: it pays, and is angry at the figure.
    const { party: p2, target: npc, mugger, heard } = await world({ apart: 1, npcTarget: true });
    const room = p2.room;
    expect(untilMugged(p2, npc)).toBe(true);
    for (let i = 0; i < ticksOf(m.threatS + 1) && muggingOf(room, npc); i++) advance(p2, 1);
    expect(heard.at(-1)?.data).toEqual({ mugger: mugger.id, target: npc, outcome: 'paid' });
    expect(balanceOf(room, npc)).toBe(21);
    expect(needsOf(npcMemory(room).brain(npc)).angryAt).toBe(mugger.id);
    // A meeting (no world phase) drops a mugging under way.
    const third = await world({ apart: 1 });
    expect(untilMugged(third.party, third.human)).toBe(true);
    holdPhase(third.party, Phase.meetingDiscussion, 60);
    advance(third.party, 1);
    expect(muggingOf(third.party.room, third.human)).toBeUndefined();
    expect(third.heard.at(-1)?.data).toMatchObject({ outcome: 'lost' });
    expect(balanceOf(third.party.room, third.human)).toBe(30);
  });
});
