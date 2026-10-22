import type { ColyseusTestServer } from '@colyseus/testing';
import { Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { avatarMemory } from '../src/sim/Avatars';
import { markDead } from '../src/sim/Death';
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
import { avatarsHeld } from './avatarHelpers';
import { setPhase, teleport } from './killHelpers';
import { type Match, sleep, stateOf } from './simHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** The seats whose avatar this bot's client currently holds (its own excluded), by room memory's handle map. */
const seen = (m: Match, i: number): string[] =>
  avatarsHeld(m.bots[i]!)
    .map((a) => avatarMemory(m.room).seatOf.get(a.handle) as string)
    .filter((id) => id !== m.bots[i]!.id)
    .sort();
/** Whether any other seat's presence reached this bot (it never does: others are avatars). */
const othersPresence = (m: Match, i: number): boolean => {
  let any = false;
  stateOf(m.bots[i]!).players.forEach((p, id) => {
    if (id !== m.bots[i]!.id && p.presence !== undefined) any = true;
  });
  return any;
};
const ids = (m: Match, ...idx: number[]) => idx.map((i) => idOf(m, i)).sort();

describe('ghost visibility (A30)', () => {
  it('a living client stops receiving a dead player at once; a ghost sees everyone in its scene', async () => {
    const m = await startParty(colyseus, 5);
    await skipPhase(m);
    await sleep(500);
    expect(seen(m, 0)).toEqual(ids(m, 1, 2, 3, 4));
    for (const i of [0, 1, 2, 3, 4]) expect(othersPresence(m, i)).toBe(false);
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

  it('no Player field carries a scene, and a ghost walking elsewhere moves nothing on the roster', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    murder(m, 2);
    const roster = () =>
      [0, 1, 3].map((i) =>
        JSON.stringify(
          [0, 1, 2, 3].map((j) => {
            const { priv: _p, presence: _r, ...row } = stateOf(m.bots[i]!).players.get(idOf(m, j))!.toJSON();
            return row;
          }),
        ),
      );
    for (const i of [0, 1, 2, 3])
      expect('sceneId' in stateOf(m.bots[i]!).players.get(idOf(m, 1))!.toJSON()).toBe(false);
    const before = roster();
    // The ghost walks into the tavern: the sim follows; no public field moves, and its own scene is its own.
    enterScene(m.room, seat(m, 2), sim(m, 2), 'tavern_bar', 'front', false);
    await sleep(400);
    expect(sim(m, 2).sceneIdx).not.toBe(0);
    expect(stateOf(m.bots[2]!).players.get(idOf(m, 2))!.priv.sceneId).toBe(sim(m, 2).sceneIdx);
    expect(roster()).toEqual(before);
    expect(seen(m, 0)).not.toContain(idOf(m, 2));

    await openMeeting(m, 1, 2);
    await sleep(300);
    for (const i of [0, 1, 2, 3]) expect(stateOf(m.bots[i]!).players.get(idOf(m, 2))!.alive).toBe(false);
    expect(stateOf(m.bots[2]!).players.get(idOf(m, 2))!.priv.sceneId).toBe(0); // on the square with everyone
  });
});

describe('the meeting roster', () => {
  it('encodes no avatar while the meeting, the reveal and game over run', async () => {
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

// Round 6, 6G: the dark cases. `view.add(scene)` carries the scene's avatars in; the same pass must take back the ones
// the viewer may not hold (sight.test.ts covers the radius, the walls and the lights).
describe('scene entry and the dark (6G)', () => {
  it('a living client walking into a scene where a ghost stands never holds the ghost', async () => {
    const m = await startParty(colyseus, 4);
    setPhase(m, Phase.day);
    teleport(m, m.bots[1]!, 'bakery', 3, 3);
    await sleep(300);
    markDead(m.room, idOf(m, 1), 'knife');
    await sleep(300);
    teleport(m, m.bots[0]!, 'bakery', 4, 4);
    expect(await until(() => avatarsHeld(m.bots[0]!).some((a) => a.scene === 'bakery'))).toBe(true);
    await sleep(300);
    expect(seen(m, 0)).toEqual([]);
  });

  it('a living client walking into a dark scene holds only the avatars it can see', async () => {
    const m = await startParty(colyseus, 4);
    setPhase(m, Phase.night);
    teleport(m, m.bots[1]!, 'cave_entry', 12, 2);
    teleport(m, m.bots[2]!, 'cave_entry', 12, 9);
    teleport(m, m.bots[3]!, 'cave_entry', 6, 4);
    await sleep(300);
    teleport(m, m.bots[0]!, 'cave_entry', 10, 2); // bots 2 and 3 are beyond the night radius, in no pool
    expect(await until(() => avatarsHeld(m.bots[0]!).some((a) => a.scene === 'cave_entry'))).toBe(true);
    await sleep(300);
    expect(seen(m, 0)).toEqual(ids(m, 1));
    expect(seen(m, 1)).toEqual(ids(m, 0));
  });
});
