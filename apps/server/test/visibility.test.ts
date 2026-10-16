import type { ColyseusTestServer } from '@colyseus/testing';
import { Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { enterScene } from '../src/sim/Portals';
import { StatusBit } from '../src/sim/constants';
import {
  bootFlowServer,
  idOf,
  murder,
  openMeeting,
  seat,
  sim,
  skipPhase,
  startParty,
  until,
} from './flowHelpers';
import { type Match, sleep, stateOf } from './simHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Ids whose presence this bot's client currently holds. */
const seen = (m: Match, i: number): string[] => {
  const out: string[] = [];
  stateOf(m.bots[i]!).players.forEach((p, id) => {
    if (id !== m.bots[i]!.id && p.presence !== undefined) out.push(id);
  });
  return out.sort();
};
const ids = (m: Match, ...idx: number[]) => idx.map((i) => idOf(m, i)).sort();

describe('ghost visibility (A30)', () => {
  it('a living client stops receiving a dead player at once; a ghost sees everyone in its scene', async () => {
    const m = await startParty(colyseus, 5);
    await skipPhase(m);
    await sleep(500);
    expect(seen(m, 0)).toEqual(ids(m, 1, 2, 3, 4));
    murder(m, 3);
    expect(await until(() => !seen(m, 0).includes(idOf(m, 3)))).toBe(true);
    for (const i of [0, 1, 2, 4])
      expect(seen(m, i)).toEqual(ids(m, 0, 1, 2, 4).filter((id) => id !== idOf(m, i)));
    expect(seen(m, 3)).toEqual(ids(m, 0, 1, 2, 4)); // the ghost still sees the living
    murder(m, 4);
    expect(await until(() => seen(m, 3).includes(idOf(m, 4)) && seen(m, 4).includes(idOf(m, 3)))).toBe(true);
    expect(seen(m, 3)).toEqual(ids(m, 0, 1, 2, 4)); // ghosts see each other
    expect(seen(m, 0)).toEqual(ids(m, 1, 2));
  });

  it("never shows a ghost's sceneId changing before the meeting", async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    const before = seat(m, 2).sceneId;
    expect(before).toBe(0);
    murder(m, 2);
    // The ghost walks into the tavern: the sim follows, the public roster does not.
    enterScene(m.room, seat(m, 2), sim(m, 2), 'tavern_bar', 'front', false);
    await sleep(400);
    expect(sim(m, 2).sceneIdx).not.toBe(0);
    for (const i of [0, 1, 2, 3]) expect(stateOf(m.bots[i]!).players.get(idOf(m, 2))!.sceneId).toBe(before);
    expect(seen(m, 0)).not.toContain(idOf(m, 2));

    await openMeeting(m, 1, 2);
    await sleep(300);
    for (const i of [0, 1, 2, 3]) expect(stateOf(m.bots[i]!).players.get(idOf(m, 2))!.alive).toBe(false);
    expect(seat(m, 2).sceneId).toBe(0); // on the square with everyone, now public
  });
});

describe('the meeting roster', () => {
  it('encodes no presence while the meeting, the reveal and game over run', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    await sleep(400);
    expect(seen(m, 0)).toHaveLength(3);
    await openMeeting(m, 1);
    await sleep(500);
    expect(m.room.state.phase).toBe(Phase.meetingDiscussion);
    for (const i of [0, 1, 2, 3]) expect(seen(m, i)).toEqual([]);
  });

  it('carries no Blood: no public Player field moves with the Blood timer', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    sim(m, 0).bloodyUntilTick = m.room.state.tick + 600;
    seat(m, 0).presence.statusBits |= StatusBit.bloody;
    await openMeeting(m, 1);
    await sleep(300);
    const roster = (i: number) => {
      const p = stateOf(m.bots[1]!).players.get(idOf(m, i))!;
      return {
        alive: p.alive,
        connected: p.connected,
        ready: p.ready,
        hasVoted: p.hasVoted,
        sceneId: p.sceneId,
      };
    };
    const killerBefore = roster(0);
    expect(killerBefore).toEqual(roster(2)); // indistinguishable from a bystander
    sim(m, 0).bloodyUntilTick = 0;
    seat(m, 0).presence.statusBits = 0;
    await sleep(300);
    expect(roster(0)).toEqual(killerBefore);
    for (const i of [1, 2, 3]) expect(stateOf(m.bots[i]!).players.get(idOf(m, 0))!.presence).toBeUndefined();
  });
});
