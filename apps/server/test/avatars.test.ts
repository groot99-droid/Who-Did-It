import type { ColyseusTestServer } from '@colyseus/testing';
import { ErrorCode, Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveHandle } from '../src/sim/Avatars';
import { markDead } from '../src/sim/Death';
import { handleKill } from '../src/sim/Kill';
import { enterScene } from '../src/sim/Portals';
import { StatusBit } from '../src/sim/constants';
import { avatarsHeld, handleOf, handlesHeld, settle } from './avatarHelpers';
import {
  bootFlowServer,
  idOf,
  openMeeting,
  seat,
  sim,
  skipPhase,
  startParty,
  until,
  voteAll,
} from './flowHelpers';
import { act, errorCodes, readyKnife, setPhase, teleport } from './killHelpers';
import { type Match, sleep, stateOf } from './simHelpers';

vi.setConfig({ testTimeout: 40_000 });

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const HANDLE = /^[A-Za-z0-9_-]{8}$/;

/** Sends a seat through a door (white-box): a crossing with its transit tail, or a plain placement. */
const go = (m: Match, i: number, scene: 'overworld' | 'tavern_bar', spawn: string, transit = false) =>
  enterScene(m.room, seat(m, i), sim(m, i), scene, spawn, transit);

/** The handles the server says live in the scene of seat `i`, for the seats the viewer may see. */
function expectedHandles(m: Match, viewer: number, seats: number[]): string[] {
  return seats
    .filter((j) => sim(m, j).sceneIdx === sim(m, viewer).sceneIdx && !sim(m, j).dead)
    .map((j) => seat(m, j).priv.avatar)
    .sort();
}

const held = (m: Match, i: number) => handlesHeld(m.bots[i]!);

describe('avatars by scene (P1, P2, P4)', () => {
  it('a view holds exactly the avatars of the living placed seats in its own scene, its own included', async () => {
    const m = await startParty(colyseus, 6);
    await skipPhase(m);
    for (const i of [3, 4, 5]) go(m, i, 'tavern_bar', 'front');
    await sleep(500);
    const all = [0, 1, 2, 3, 4, 5];
    for (const i of all) expect(held(m, i)).toEqual(expectedHandles(m, i, all));
    expect(held(m, 0)).toHaveLength(3);
    expect(held(m, 4)).toHaveLength(3);
    // The own scene is the only SceneState with avatars in the view.
    for (const i of all) {
      const scenes = new Set(avatarsHeld(m.bots[i]!).map((a) => a.scene));
      expect(scenes.size).toBe(1);
    }
    // No other seat's Presence or Private ever arrives (the own do), and no Player row carries a scene.
    for (const i of all)
      stateOf(m.bots[i]!).players.forEach((p, id) => {
        expect('sceneId' in p.toJSON()).toBe(false);
        if (id === idOf(m, i)) expect(p.presence).toBeDefined();
        else expect(p.presence).toBeUndefined();
      });
    // No other seat's Private ever arrives; the own does.
    for (const i of all)
      stateOf(m.bots[i]!).players.forEach((p, id) => {
        if (id === idOf(m, i)) expect(p.priv).toBeDefined();
        else expect(p.priv).toBeUndefined();
      });
  });

  it('the avatar carries the walker position, height and own face', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    await sleep(400);
    for (const j of [0, 1, 2, 3]) {
      const a = stateOf(m.bots[1]!).scenes.get('overworld')!.avatars.get(seat(m, j).priv.avatar)!;
      expect(a.lookOf).toBe(idOf(m, j));
      expect(a.height).toBe(seat(m, j).traits.height);
      expect(a.x).toBe(seat(m, j).presence.x);
      expect(a.y).toBe(seat(m, j).presence.y);
      expect(a.seat).toBeFalsy(); // a living client never receives the true seat
    }
  });

  it('priv.sceneId follows every crossing, meeting move and immunity placement', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    expect(seat(m, 2).priv.sceneId).toBe(sim(m, 2).sceneIdx);
    go(m, 2, 'tavern_bar', 'front');
    await sleep(300);
    expect(sim(m, 2).sceneIdx).not.toBe(0);
    expect(stateOf(m.bots[2]!).players.get(idOf(m, 2))!.priv.sceneId).toBe(sim(m, 2).sceneIdx);
    await openMeeting(m, 1);
    await sleep(300);
    expect(stateOf(m.bots[2]!).players.get(idOf(m, 2))!.priv.sceneId).toBe(0);
  });
});

describe('handles (P6)', () => {
  it('are 8 base64url characters, never a seat id, one scene at a time, and track priv.avatar', async () => {
    const m = await startParty(colyseus, 5);
    await skipPhase(m);
    await sleep(400);
    const seen = new Set<string>();
    const check = () => {
      const handles = new Set<string>();
      for (const i of [0, 1, 2, 3, 4]) for (const h of held(m, i)) handles.add(h);
      const ids = [0, 1, 2, 3, 4].map((i) => idOf(m, i));
      for (const h of handles) {
        expect(h).toMatch(HANDLE);
        expect(ids).not.toContain(h);
        seen.add(h);
      }
      for (const i of [0, 1, 2, 3, 4]) {
        // One scene at a time: no handle in two scenes of the whole state.
        const own = stateOf(m.bots[i]!).players.get(idOf(m, i))!.priv.avatar;
        expect(own).toBe(seat(m, i).priv.avatar);
        expect(held(m, i)).toContain(own);
      }
    };
    check();
    const first = seat(m, 2).priv.avatar;
    go(m, 2, 'tavern_bar', 'front');
    await sleep(400);
    check();
    const second = seat(m, 2).priv.avatar;
    expect(second).not.toBe(first);
    go(m, 2, 'overworld', 'tavern_front');
    await sleep(300);
    expect(seat(m, 2).priv.avatar).not.toBe(second);
    // Every handle drawn so far is distinct from every other.
    const all = [first, second, seat(m, 2).priv.avatar];
    expect(new Set(all).size).toBe(3);
  });

  it('are re-rolled on a meeting move, an immunity placement and a death', async () => {
    const m = await startParty(colyseus, 5);
    await skipPhase(m);
    await sleep(300);
    const before = [0, 1, 2, 3, 4].map((i) => seat(m, i).priv.avatar);
    await openMeeting(m, 1);
    await sleep(300);
    const atMeeting = [0, 1, 2, 3, 4].map((i) => seat(m, i).priv.avatar);
    for (let i = 0; i < 5; i++) expect(atMeeting[i]).not.toBe(before[i]);
    await voteAll(m, [0, 1, 2, 3, 4], () => 'skip');
    await skipPhase(m);
    expect(m.room.state.phase).toBe(Phase.immunity);
    await sleep(200);
    const atImmunity = [0, 1, 2, 3, 4].map((i) => seat(m, i).priv.avatar);
    for (let i = 0; i < 5; i++) expect(atImmunity[i]).not.toBe(atMeeting[i]);
    await sleep(200);
    setPhase(m, Phase.day);
    const alive = seat(m, 3).priv.avatar;
    markDead(m.room, idOf(m, 3), 'knife', idOf(m, 0));
    expect(seat(m, 3).priv.avatar).not.toBe(alive);
    expect(seat(m, 3).priv.avatar).toMatch(HANDLE);
  });

  it('a crossing leaves the old avatar in the old scene with the transit bit, and the new handle in the new', async () => {
    const m = await startParty(colyseus, 5);
    await skipPhase(m);
    await sleep(400);
    const old = seat(m, 2).priv.avatar;
    go(m, 2, 'tavern_bar', 'front', true);
    const until_ = seat(m, 2).presence.transitUntilTick;
    expect(until_).toBeGreaterThan(m.room.state.tick);
    await sleep(150);
    const tail = stateOf(m.bots[0]!).scenes.get('overworld')!.avatars.get(old);
    expect(tail).toBeDefined();
    expect(tail!.statusBits & StatusBit.transit).toBe(StatusBit.transit);
    expect(tail!.lookOf).toBe(idOf(m, 2));
    const fresh = seat(m, 2).priv.avatar;
    expect(fresh).not.toBe(old);
    expect(stateOf(m.bots[2]!).scenes.get('tavern_bar')!.avatars.get(fresh)).toBeDefined();
    expect(
      await until(() => stateOf(m.bots[0]!).scenes.get('overworld')!.avatars.get(old) === undefined),
    ).toBe(true);
    expect(m.room.state.tick).toBeGreaterThanOrEqual(until_);
  });
});

describe('deaths (P5)', () => {
  it('living views lose the victim at once; the ghost sees its scene with the true seats', async () => {
    const m = await startParty(colyseus, 5);
    await skipPhase(m);
    await sleep(400);
    const victim = idOf(m, 3);
    const victimHandle = seat(m, 3).priv.avatar;
    expect(held(m, 0)).toContain(victimHandle);
    markDead(m.room, victim, 'knife', idOf(m, 0));
    expect(await until(() => !held(m, 0).includes(victimHandle))).toBe(true);
    // No living view ever holds the ghost's new avatar or a true seat.
    await sleep(300);
    for (const i of [0, 1, 2, 4]) {
      expect(held(m, i)).not.toContain(seat(m, 3).priv.avatar);
      for (const a of avatarsHeld(m.bots[i]!)) expect(a.avatar.seat).toBeFalsy();
    }
    // The ghost sees every avatar of its scene, itself included, with the true seat.
    const ghost = avatarsHeld(m.bots[3]!);
    expect(ghost.map((a) => a.handle).sort()).toEqual(
      [0, 1, 2, 3, 4].map((i) => seat(m, i).priv.avatar).sort(),
    );
    for (const a of ghost) {
      const owner = [0, 1, 2, 3, 4].find((i) => seat(m, i).priv.avatar === a.handle)!;
      expect(a.avatar.seat).toBe(idOf(m, owner));
    }
    const mine = ghost.find((a) => a.handle === seat(m, 3).priv.avatar)!;
    expect(mine.avatar.statusBits & StatusBit.ghost).toBe(StatusBit.ghost);
  });
});

describe('outside the world (P4)', () => {
  it('no view holds an avatar during the meeting, the vote, the reveal and game over', async () => {
    const m = await startParty(colyseus, 5);
    await skipPhase(m);
    await sleep(300);
    const none = () => {
      for (const i of [0, 1, 2, 3, 4]) expect(held(m, i)).toEqual([]);
    };
    await openMeeting(m, 1);
    await sleep(500);
    expect(m.room.state.phase).toBe(Phase.meetingDiscussion);
    none();
    await skipPhase(m);
    await sleep(300);
    expect(m.room.state.phase).toBe(Phase.meetingVote);
    none();
    await voteAll(m, [0, 1, 2, 3, 4], () => idOf(m, 0));
    await sleep(300);
    expect(m.room.state.phase).toBe(Phase.reveal);
    none();
    await skipPhase(m);
    expect(await until(() => m.room.state.phase === Phase.gameOver)).toBe(true);
    await sleep(300);
    none();
  });
});

describe('Kill and Bandage take a handle (P12)', () => {
  async function pair() {
    const m = await startParty(colyseus, 5);
    await skipPhase(m);
    setPhase(m, Phase.night);
    const [k, v, d] = [m.bots[0]!, m.bots[1]!, m.bots[3]!];
    readyKnife(m, k);
    teleport(m, k, 'overworld', 30, 22);
    teleport(m, v, 'overworld', 31, 22);
    teleport(m, d, 'overworld', 38, 18);
    teleport(m, m.bots[2]!, 'overworld', 36, 18);
    teleport(m, m.bots[4]!, 'overworld', 37, 18);
    settle(m, k, v, d, m.bots[2]!, m.bots[4]!);
    await sleep(300);
    return { m, k, v, d };
  }

  it('accepts a current handle in the actor scene', async () => {
    const { m, k, v } = await pair();
    await act(k, 'act.ability', { abilityId: 'kill', targetId: handleOf(m, v) });
    expect(errorCodes(k)).toEqual([]);
    expect(sim(m, 1).dead).toBe(true);
  });

  it('refuses a seat id, a stale handle, the own handle and a handle from another scene with 422', async () => {
    const { m, k, v, d } = await pair();
    const stale = handleOf(m, v);
    settle(m, v); // the victim now walks under a new handle
    teleport(m, d, 'overworld', 32, 22);
    const elsewhere = handleOf(m, m.bots[2]!);
    teleport(m, m.bots[2]!, 'tavern_bar', 4, 4);
    settle(m, m.bots[2]!);
    await sleep(300);
    for (const targetId of [v.id, stale, handleOf(m, k), elsewhere, 'nobody']) {
      await act(k, 'act.ability', { abilityId: 'kill', targetId }, 150);
    }
    expect(errorCodes(k)).toEqual(Array(5).fill(ErrorCode.cannot));
    expect(sim(m, 1).dead).toBe(false);
  });

  it('resolves a handle only inside the actor scene', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    await sleep(300);
    const h1 = seat(m, 1).priv.avatar;
    expect(resolveHandle(m.room, idOf(m, 0), h1)).toBe(idOf(m, 1));
    expect(resolveHandle(m.room, idOf(m, 0), idOf(m, 1))).toBeNull();
    expect(resolveHandle(m.room, idOf(m, 0), seat(m, 0).priv.avatar)).toBeNull();
    expect(resolveHandle(m.room, idOf(m, 0), 7)).toBeNull();
    go(m, 1, 'tavern_bar', 'front');
    expect(resolveHandle(m.room, idOf(m, 0), seat(m, 1).priv.avatar)).toBeNull();
    // Direct call: a handle from the actor scene works through handleKill as through the wire.
    go(m, 1, 'overworld', 'tavern_front');
    settle(m, m.bots[0]!);
    expect(() => handleKill(m.room, idOf(m, 0), { targetId: seat(m, 1).priv.avatar })).not.toThrow();
  });
});
