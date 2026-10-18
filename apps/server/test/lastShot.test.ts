import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { abilities, balance } from '@wdi/content';
import { ErrorCode, NoteKind, Phase, TICK_RATE } from '@wdi/shared';
import { createServer } from '../src/server';
import { flowOf } from '../src/sim/Flow';
import { nightOf } from '../src/sim/nightMemory';
import { npcMemory } from '../src/sim/npc/memory';
import { registerNpcSeat } from '../src/sim/Npc';
import { simOf } from '../src/sim/RoomSim';
import { events, skipPhase, until, voteAll } from './flowHelpers';
import { act, errorCodes, playerOf, readyKnife, record, setPhase, sleep, teleport } from './killHelpers';
import { giveKit, notes, nightfall, power, toPhase } from './nightHelpers';
import { avatarsHeld, handleOf, settle } from './avatarHelpers';
import { type Match, startMatch } from './simHelpers';

// The npc vote target is 5H's; these tests stand in for it.
const target = vi.hoisted(() => ({ value: null as string | null }));
vi.mock('../src/sim/npc/meeting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/sim/npc/meeting')>()),
  npcVoteTarget: () => target.value,
}));

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  process.env.WDI_DEBUG = '1';
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => {
  target.value = null;
  await colyseus.cleanup();
});

const AIM_TICKS = (abilities.abilities.lastShot?.params?.aimS ?? 0) * TICK_RATE;
const ROW = 22;
const id = (m: Match, i: number) => m.bots[i]!.id;

// Seats: 0 Killer, 1 Gamekeeper, 2 Townsfolk, 3 Detective, 4 Doctor.
async function party(): Promise<Match> {
  const m = await startMatch(colyseus, 5, {
    Bot0: 'killer',
    Bot1: 'gamekeeper',
    Bot2: 'townsfolk',
    Bot3: 'detective',
    Bot4: 'doctor',
  });
  for (const b of m.bots) giveKit(m, b);
  await nightfall(m);
  teleport(m, m.bots[0]!, 'overworld', 30, ROW);
  teleport(m, m.bots[1]!, 'overworld', 31, ROW);
  for (const i of [2, 3, 4]) teleport(m, m.bots[i]!, 'overworld', 30 + i, 18);
  return m;
}
const knife = async (m: Match, victim = 1) => {
  readyKnife(m, m.bots[0]!);
  settle(m, m.bots[0]!, m.bots[victim]!);
  await act(m.bots[0]!, 'act.ability', { abilityId: 'kill', targetId: handleOf(m, m.bots[victim]!) });
};
// Other seats are avatars now (5F): a viewer sees a seat when it holds an avatar drawn as that seat's face.
const sees = (m: Match, viewer: number, other: number): boolean =>
  avatarsHeld(m.bots[viewer]!).some((a) => a.avatar.lookOf === id(m, other));

describe('Last Shot (GDD 3.2)', () => {
  it('blacks out a knifed Gamekeeper, defers its killed message and opens the ghost view when the aim closes (P5)', async () => {
    const m = await party();
    const gk = m.bots[1]!;
    await sleep(300);
    expect(sees(m, 1, 0)).toBe(true);
    const tick = m.room.state.tick;
    await knife(m);
    await sleep(300);
    const aims = events(gk, 'aim');
    expect(aims).toHaveLength(1);
    expect(aims[0]!.endsTick as number).toBeGreaterThanOrEqual(tick + AIM_TICKS);
    expect(events(gk, 'killed')).toEqual([]);
    for (const other of [0, 2, 3, 4]) expect(sees(m, 1, other)).toBe(false);
    expect(simOf(m.room).players.get(id(m, 1))!.dead).toBe(true);
    // Everyone else sees the world as after any kill: the body is there, the Gamekeeper's presence is gone.
    expect(sees(m, 2, 1)).toBe(false);
    nightOf(m.room).aims.get(id(m, 1))!.untilTick = m.room.state.tick; // the aim runs out without a shot
    await until(() => events(gk, 'killed').length === 1, 2000);
    expect(events(gk, 'killed')[0]).toMatchObject({ cause: 'knife' });
    await sleep(300);
    expect(sees(m, 1, 0)).toBe(true); // a ghost sees every seat of its scene
  });

  it('shoots a seat from the list: it dies at once (cause shot), leaves a body and rings 10 tiles', async () => {
    const m = await party();
    const rec = record(m);
    const gk = m.bots[1]!;
    teleport(m, m.bots[4]!, 'overworld', 33, ROW);
    await knife(m);
    await sleep(200);
    await power(gk, 'lastShot', id(m, 2));
    expect(errorCodes(gk)).toEqual([]);
    expect(events(gk, 'killed')).toHaveLength(1);
    expect(simOf(m.room).players.get(id(m, 2))!.dead).toBe(true);
    expect(rec.deaths.map((d) => d.cause)).toEqual(['knife', 'shot']);
    expect(m.room.state.scenes.get('overworld')!.bodies.has(`body_${id(m, 2)}`)).toBe(true);
    expect(notes(m, gk).map((e) => [e.note, e.of])).toEqual([[NoteKind.shot, id(m, 2)]]);
    const noise = events(m.bots[4]!, 'noise').filter((e) => e.kind === 'shot');
    expect(noise.length).toBeGreaterThan(0);
    await power(gk, 'lastShot', id(m, 3)); // the aim is closed
    expect(errorCodes(gk)).toEqual([ErrorCode.cannot]);
  });

  it('refuses a shot with no aim open, at the Gamekeeper itself, and at a publicly dead seat', async () => {
    const m = await party();
    const gk = m.bots[1]!;
    await power(gk, 'lastShot', id(m, 0)); // no aim yet
    await knife(m);
    await sleep(200);
    playerOf(m, m.bots[3]!).alive = false;
    await power(gk, 'lastShot', id(m, 1));
    await power(gk, 'lastShot', id(m, 3));
    await power(m.bots[2]!, 'lastShot', id(m, 0)); // not a Gamekeeper
    expect(errorCodes(gk)).toEqual([ErrorCode.cannot, ErrorCode.cannot, ErrorCode.cannot]);
    expect(errorCodes(m.bots[2]!)).toEqual([ErrorCode.cannot]);
  });

  it('waits for nobody: the Bell-less request opens its meeting on the same tick and phases keep their clock (P17)', async () => {
    const m = await party();
    await knife(m);
    await sleep(100);
    const state = m.room.state;
    simOf(m.room).meetingRequests.push({ reason: 'body', callerId: id(m, 2), bodyOf: id(m, 1) });
    const t0 = state.tick;
    await until(() => state.phase === Phase.meetingDiscussion, 1000);
    expect(state.tick - t0).toBeLessThanOrEqual(2);
    // The aim runs on through the meeting, and a shot there kills at once, no role shown.
    expect(flowOf(m.room).pendingEjection).toBeNull();
    await power(m.bots[1]!, 'lastShot', id(m, 0));
    expect(simOf(m.room).players.get(id(m, 0))!.dead).toBe(true);
    expect(playerOf(m, m.bots[0]!).alive).toBe(false);
    expect(events(m.bots[2]!, 'shot')).toEqual([]);
    await toPhase(m, Phase.night);
  });

  it('holds the win check of its batch until the aim closes', async () => {
    const m = await party();
    // Village 3 of 5 once the Gamekeeper falls: not a win. Kill the others so that the Gamekeeper's fall decides.
    for (const i of [2, 3]) simOf(m.room).players.get(id(m, i))!.dead = true;
    await knife(m); // 1 killer vs 1 doctor (+ the aiming Gamekeeper): parity at 4-5 players is village <= 1
    await sleep(300);
    expect(m.room.state.phase).not.toBe(Phase.gameOver);
    await power(m.bots[1]!, 'lastShot', id(m, 4)); // the shot takes the last villager: the Cabal wins
    await sleep(300);
    expect(m.room.state.phase).toBe(Phase.gameOver);
  });

  it('holds an ejected Gamekeeper’s reveal until it shoots, then announces the shot with the role', async () => {
    const m = await party();
    await toPhase(m, Phase.day);
    simOf(m.room).meetingRequests.push({ reason: 'bell', callerId: id(m, 2) });
    await until(() => m.room.state.phase === Phase.meetingDiscussion);
    await skipPhase(m);
    await voteAll(m, [0, 1, 2, 3, 4], () => id(m, 1));
    expect(await until(() => events(m.bots[1]!, 'aim').length === 1)).toBe(true);
    expect(events(m.bots[1]!, 'killed')).toHaveLength(0); // no role reaches the aiming seat before its shot
    m.room.state.phaseEndsTick = m.room.state.tick; // the reveal's 8 s are up
    await sleep(300);
    expect(m.room.state.phase).toBe(Phase.reveal);
    await power(m.bots[1]!, 'lastShot', id(m, 0));
    expect(await until(() => events(m.bots[2]!, 'shot').length === 1)).toBe(true);
    expect(events(m.bots[2]!, 'shot')[0]).toEqual({ fromId: id(m, 1), targetId: id(m, 0), role: 'killer' });
    expect(playerOf(m, m.bots[0]!).alive).toBe(false);
    expect(await until(() => events(m.bots[1]!, 'killed').length === 1)).toBe(true);
    expect(events(m.bots[1]!, 'killed')[0]).toMatchObject({ cause: 'ejected' });
    await sleep(300);
    expect(m.room.state.phase).toBe(Phase.gameOver); // both the Gamekeeper and the Killer are out: the Village wins
  });

  it('lets an NPC Gamekeeper shoot at brain.lastShotAtTick at npcVoteTarget, or hold its fire', async () => {
    const m = await party();
    registerNpcSeat(m.room, id(m, 1));
    const brain = npcMemory(m.room).brain(id(m, 1));
    target.value = id(m, 0);
    await knife(m);
    brain.lastShotAtTick = m.room.state.tick + 6;
    await sleep(600);
    expect(simOf(m.room).players.get(id(m, 0))!.dead).toBe(true);
    expect(notes(m, m.bots[1]!)).toHaveLength(1);
    expect(notes(m, m.bots[1]!)[0]!.tick).toBe(brain.lastShotAtTick);
  });

  it('draws the NPC shot tick itself: lastShotS after the aim starts, at brain.lastShotAtTick', async () => {
    const span = balance.npc.nightPower.lastShotS;
    const saved = { ...span };
    Object.assign(span, { min: 0.5, max: 1 }); // a short draw keeps the test fast; the bounds follow the row
    try {
      const m = await party();
      registerNpcSeat(m.room, id(m, 1));
      target.value = id(m, 0);
      await knife(m);
      expect(await until(() => notes(m, m.bots[1]!).length === 1)).toBe(true);
      const aimStart = (events(m.bots[1]!, 'aim')[0]!.endsTick as number) - AIM_TICKS;
      const shotTick = notes(m, m.bots[1]!)[0]!.tick;
      expect(shotTick).toBe(npcMemory(m.room).brain(id(m, 1)).lastShotAtTick);
      expect(shotTick - aimStart).toBeGreaterThanOrEqual(span.min * TICK_RATE - 1);
      expect(shotTick - aimStart).toBeLessThanOrEqual(span.max * TICK_RATE + 1);
      expect(simOf(m.room).players.get(id(m, 0))!.dead).toBe(true);
    } finally {
      Object.assign(span, saved);
    }
  });

  it('holds its fire when the NPC has nobody to vote for', async () => {
    const m = await party();
    registerNpcSeat(m.room, id(m, 1));
    const brain = npcMemory(m.room).brain(id(m, 1));
    target.value = null;
    await knife(m);
    brain.lastShotAtTick = m.room.state.tick + 6;
    await sleep(600);
    expect(notes(m, m.bots[1]!)).toHaveLength(0);
    expect(simOf(m.room).players.get(id(m, 0))!.dead).toBe(false);
    setPhase(m, Phase.night);
  });
});
