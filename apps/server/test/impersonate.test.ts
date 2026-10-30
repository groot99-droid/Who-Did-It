import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { ErrorCode, Phase, TILE_PX } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { avatarMemory } from '../src/sim/Avatars';
import { markDead } from '../src/sim/Death';
import { enterScene } from '../src/sim/Portals';
import { figureOfHandle } from '../src/sim/townsfolk/figures';
import { avatarsHeld, handleOf, seatAvatarsHeld, settle } from './avatarHelpers';
import {
  bootFlowServer,
  events,
  idOf,
  openMeeting,
  seat,
  sim,
  skipPhase,
  startParty,
  until,
} from './flowHelpers';
import { act, errorCodes, placeAtPx, readyKnife, setPhase, teleport } from './killHelpers';
import { type Match, sleep, stateOf } from './simHelpers';

vi.setConfig({ testTimeout: 40_000 });

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const NUM = balance.impersonate;
const saved = { ...NUM };
beforeEach(() => Object.assign(NUM, saved));

/** Bot0 is the Killer, Bot1 the Detective, Bot2 the Doctor...; the night, the knife ready. */
async function night(n = 5): Promise<Match> {
  const m = await startParty(colyseus, n);
  await skipPhase(m);
  setPhase(m, Phase.night);
  readyKnife(m, m.bots[0]!);
  return m;
}

/** Everyone but the Killer goes to the tavern; the Killer stays in the overworld (white-box, no transit). */
function aloneInOverworld(m: Match): void {
  for (let i = 1; i < m.bots.length; i++) teleport(m, m.bots[i]!, 'tavern_bar', 3 + i, 4);
  settle(m, ...m.bots);
}

const disguise = (m: Match) => avatarMemory(m.room).disguise.get(idOf(m, 0));
const impersonate = (m: Match, target: string, i = 0) =>
  act(m.bots[i]!, 'act.ability', { abilityId: 'impersonate', targetId: target }, 120);
const cooldown = (m: Match) => seat(m, 0).priv.cooldownEndTick.get('impersonate') ?? 0;
const roster = (m: Match, observer: number, i: number) => {
  const {
    priv: _priv,
    presence: _presence,
    ...row
  } = stateOf(m.bots[observer]!).players.get(idOf(m, i))!.toJSON();
  return row;
};

describe('Impersonate refusals', () => {
  it('refuses by day (425), a non-Killer, self and a publicly dead seat (422), the cooldown (424)', async () => {
    const m = await night();
    const k = m.bots[0]!;
    setPhase(m, Phase.day);
    await impersonate(m, idOf(m, 2));
    expect(errorCodes(k)).toEqual([ErrorCode.wrongPhase]);
    setPhase(m, Phase.night);
    await impersonate(m, idOf(m, 2), 1); // the Detective
    expect(errorCodes(m.bots[1]!)).toEqual([ErrorCode.cannot]);
    await impersonate(m, idOf(m, 0));
    seat(m, 3).alive = false;
    await impersonate(m, idOf(m, 3));
    await impersonate(m, 'nobody');
    expect(errorCodes(k)).toEqual([
      ErrorCode.wrongPhase,
      ErrorCode.cannot,
      ErrorCode.cannot,
      ErrorCode.cannot,
    ]);
    seat(m, 0).priv.cooldownEndTick.set('impersonate', m.room.state.tick + 1000);
    await impersonate(m, idOf(m, 2));
    expect(errorCodes(k).at(-1)).toBe(ErrorCode.cooldown);
    expect(disguise(m)).toBeUndefined();
  });

  it('a second use while pending or applied is accepted, asks to drop and checks no target', async () => {
    const m = await night();
    const k = m.bots[0]!;
    await impersonate(m, idOf(m, 2));
    expect(disguise(m)).toMatchObject({ as: idOf(m, 2), applied: false, dropRequested: false });
    await impersonate(m, 'nobody');
    expect(errorCodes(k)).toEqual([]);
    // A pending request that asked to drop is cancelled at no cooldown on the next stage.
    expect(disguise(m)).toBeUndefined();
    expect(cooldown(m)).toBe(0);
  });
});

describe('the face changes only unseen', () => {
  it('a request in company changes nothing any client receives', async () => {
    const m = await night();
    aloneInOverworld(m);
    teleport(m, m.bots[1]!, 'overworld', 33, 22);
    settle(m, m.bots[1]!);
    await sleep(300);
    // Round 10, x5 (A353): the scene's figures share the view and walk between the two snapshots, so they are left out.
    const snapshot = (b: (typeof m.bots)[number]) =>
      JSON.stringify(stateOf(b).toJSON(), (k, v) =>
        k === 'tick' || figureOfHandle(m.room, k) !== undefined ? undefined : v,
      );
    const before = m.bots.map(snapshot);
    const rosters = [1, 2, 3, 4].map((i) => roster(m, 2, i));
    await impersonate(m, idOf(m, 3));
    await sleep(300);
    expect(disguise(m)?.applied).toBe(false);
    const after = m.bots.map(snapshot);
    expect(after).toEqual(before);
    expect([1, 2, 3, 4].map((i) => roster(m, 2, i))).toEqual(rosters);
    for (const b of m.bots) expect(events(b, 'vfx')).toEqual([]);
  });

  it('applies on the first tick the Killer is alone: borrowed look, own height, the row unchanged, no vfx', async () => {
    const m = await night();
    teleport(m, m.bots[1]!, 'overworld', 33, 22);
    settle(m, m.bots[1]!);
    await impersonate(m, idOf(m, 3));
    expect(disguise(m)?.applied).toBe(false);
    const row = roster(m, 2, 0);
    const old = seat(m, 0).priv.avatar;
    for (const i of [1, 2, 3, 4]) teleport(m, m.bots[i]!, 'tavern_bar', 3 + i, 4);
    settle(m, ...m.bots.slice(1));
    expect(await until(() => disguise(m)?.applied === true)).toBe(true);
    await sleep(250);
    const handle = seat(m, 0).priv.avatar;
    expect(handle).not.toBe(old);
    const own = stateOf(m.bots[0]!).scenes.get('overworld')!.avatars.get(handle)!;
    expect(own.lookOf).toBe(idOf(m, 3));
    expect(own.height).toBe(seat(m, 0).traits.height);
    expect(roster(m, 2, 0)).toEqual(row);
    for (const b of m.bots) expect(events(b, 'vfx')).toEqual([]);
  });

  it('a request that is not applied within applyWindowS is cancelled and costs no cooldown', async () => {
    NUM.applyWindowS = 0.6;
    const m = await night();
    teleport(m, m.bots[1]!, 'overworld', 33, 22);
    settle(m, m.bots[1]!);
    await impersonate(m, idOf(m, 3));
    expect(disguise(m)).toBeDefined();
    expect(await until(() => disguise(m) === undefined, 3000)).toBe(true);
    expect(cooldown(m)).toBe(0);
  });

  it('a crossing applies a pending disguise: the old scene keeps the old face, the new scene shows the target', async () => {
    const m = await night();
    teleport(m, m.bots[1]!, 'overworld', 33, 22); // company, so nothing applies yet
    placeAtPx(m, m.bots[1]!, sim(m, 0).x + TILE_PX, sim(m, 0).y); // within the night radius (8L)
    settle(m, m.bots[1]!);
    for (const i of [2, 3, 4]) teleport(m, m.bots[i]!, 'tavern_bar', 3 + i, 9); // by the front door (8L)
    settle(m, ...m.bots.slice(2));
    await impersonate(m, idOf(m, 3));
    const old = seat(m, 0).priv.avatar;
    enterScene(m.room, seat(m, 0), sim(m, 0), 'tavern_bar', 'front', true);
    expect(disguise(m)?.applied).toBe(true);
    await sleep(120);
    const tail = stateOf(m.bots[1]!).scenes.get('overworld')!.avatars.get(old);
    expect(tail?.lookOf).toBe(idOf(m, 0));
    const fresh = seat(m, 0).priv.avatar;
    const arrived = stateOf(m.bots[2]!).scenes.get('tavern_bar')!.avatars.get(fresh);
    expect(arrived?.lookOf).toBe(idOf(m, 3));
    expect(arrived?.height).toBe(seat(m, 0).traits.height);
  });

  it('a ghost in the scene sees the true seat on the borrowed avatar', async () => {
    const m = await night();
    aloneInOverworld(m);
    teleport(m, m.bots[3]!, 'overworld', 33, 22);
    markDead(m.room, idOf(m, 3), 'knife', idOf(m, 0));
    settle(m, m.bots[3]!);
    await impersonate(m, idOf(m, 2));
    expect(await until(() => disguise(m)?.applied === true)).toBe(true);
    await sleep(300);
    const mine = avatarsHeld(m.bots[3]!).find((a) => a.handle === seat(m, 0).priv.avatar);
    expect(mine?.avatar.lookOf).toBe(idOf(m, 2));
    expect(mine?.avatar.seat).toBe(idOf(m, 0));
  });
});

describe('drops', () => {
  async function disguised(): Promise<Match> {
    const m = await night();
    aloneInOverworld(m);
    await impersonate(m, idOf(m, 3));
    expect(await until(() => disguise(m)?.applied === true)).toBe(true);
    return m;
  }

  /** A victim steps next to the Killer, in company. */
  async function company(m: Match, i = 1): Promise<void> {
    teleport(m, m.bots[0]!, 'overworld', 30, 22);
    teleport(m, m.bots[i]!, 'overworld', 31, 22);
    settle(m, m.bots[0]!, m.bots[i]!);
    await sleep(250);
  }

  it('a strike drops it in place with exactly one vfx to the scene, naming no handle or seat', async () => {
    const m = await disguised();
    await company(m);
    const witness = m.bots[2]!;
    teleport(m, witness, 'overworld', 33, 22);
    settle(m, witness);
    await sleep(250);
    await act(m.bots[0]!, 'act.ability', { abilityId: 'kill', targetId: handleOf(m, m.bots[1]!) }, 400);
    expect(disguise(m)).toBeUndefined();
    expect(cooldown(m)).toBeGreaterThan(m.room.state.tick);
    for (const i of [0, 1, 2]) {
      const vfx = events(m.bots[i]!, 'vfx');
      expect(vfx).toHaveLength(1);
      expect(Object.keys(vfx[0]!).sort()).toEqual(['kind', 'sceneId', 'x', 'y']);
      expect(vfx[0]).toMatchObject({ sceneId: 'overworld', kind: 'disguise' });
    }
    for (const i of [3, 4]) expect(events(m.bots[i]!, 'vfx')).toEqual([]);
    // The kill clues carry the Killer's own traits.
    const clues = [...m.room.state.scenes.get('overworld')!.clues.values()].filter(
      (c) => c.id !== 'clue_teaching',
    );
    expect(clues.map((c) => c.value).sort()).toEqual(
      [seat(m, 0).traits.height, seat(m, 0).traits.scarf].sort(),
    );
  });

  it('a strike voided by a Bandage drops it too', async () => {
    const m = await disguised();
    await company(m);
    sim(m, 1).bandagedUntilTick = m.room.state.tick + 1000;
    await act(m.bots[0]!, 'act.ability', { abilityId: 'kill', targetId: handleOf(m, m.bots[1]!) }, 400);
    expect(sim(m, 1).dead).toBe(false);
    expect(disguise(m)).toBeUndefined();
    expect(events(m.bots[1]!, 'vfx')).toHaveLength(1);
  });

  it('a meeting and the Killer death end it with no vfx', async () => {
    const m = await disguised();
    await openMeeting(m, 1);
    await sleep(300);
    expect(disguise(m)).toBeUndefined();
    for (const b of m.bots) expect(events(b, 'vfx')).toEqual([]);
    const m2 = await disguised();
    markDead(m2.room, idOf(m2, 0), 'knife', idOf(m2, 1));
    expect(disguise(m2)).toBeUndefined();
    for (const b of m2.bots) expect(events(b, 'vfx')).toEqual([]);
  });

  it('a second use, the run end and daybreak drop it only when alone or through a door; the cooldown counts from the drop', async () => {
    const m = await disguised();
    await company(m, 4);
    await impersonate(m, 'nobody'); // second use
    expect(disguise(m)?.dropRequested).toBe(true);
    await sleep(300);
    expect(disguise(m)?.applied).toBe(true); // not alone: it waits
    expect(cooldown(m)).toBe(0);
    teleport(m, m.bots[4]!, 'tavern_bar', 3, 4);
    settle(m, m.bots[4]!);
    expect(await until(() => disguise(m) === undefined)).toBe(true);
    expect(cooldown(m)).toBeGreaterThan(m.room.state.tick);
    expect(cooldown(m) - m.room.state.tick).toBeLessThanOrEqual(NUM.cooldownS * 20);
    for (const b of m.bots) expect(events(b, 'vfx')).toEqual([]);
  });

  it('daybreak asks it to drop; a door drops it inside the crossing', async () => {
    const m = await disguised();
    await company(m, 4);
    setPhase(m, Phase.day);
    await sleep(200);
    expect(disguise(m)).toMatchObject({ applied: true, dropRequested: true });
    enterScene(m.room, seat(m, 0), sim(m, 0), 'tavern_bar', 'front', true);
    expect(disguise(m)).toBeUndefined();
    expect(cooldown(m)).toBeGreaterThan(0);
    // The door dropped it: the figure that arrives wears the Killer's own face again.
    teleport(m, m.bots[1]!, 'tavern_bar', 4, 4);
    settle(m, m.bots[1]!);
    await sleep(250);
    expect(stateOf(m.bots[1]!).scenes.get('tavern_bar')!.avatars.get(seat(m, 0).priv.avatar)?.lookOf).toBe(
      idOf(m, 0),
    );
  });

  it('the duration running out asks it to drop', async () => {
    NUM.durationS = 0.6;
    const m = await night();
    aloneInOverworld(m);
    await impersonate(m, idOf(m, 3));
    expect(await until(() => disguise(m)?.applied === true)).toBe(true);
    expect(await until(() => disguise(m) === undefined, 4000)).toBe(true);
    expect(cooldown(m)).toBeGreaterThan(0);
  });
});

describe('what an observer sees (P6, P10)', () => {
  /** Every handle added or removed in one observer patch, with its position. */
  function watch(m: Match, i: number) {
    const seen = new Map<string, { x: number; y: number; scene: string }>();
    const swaps: string[] = [];
    let allowed = false;
    const log = { allow: (on: boolean) => (allowed = on), swaps };
    m.bots[i]!.room.onStateChange(() => {
      const now = new Map(
        avatarsHeld(m.bots[i]!).map((a) => [a.handle, { x: a.avatar.x, y: a.avatar.y, scene: a.scene }]),
      );
      const removed = [...seen].filter(([h]) => !now.has(h));
      const added = [...now].filter(([h]) => !seen.has(h));
      for (const [hr, r] of removed)
        for (const [ha, a] of added) {
          const near = r.scene === a.scene && Math.hypot(r.x - a.x, r.y - a.y) <= TILE_PX;
          if (near && !allowed) swaps.push(`${hr}->${ha}`);
        }
      seen.clear();
      for (const [h, v] of now) seen.set(h, v);
    });
    return log;
  }

  it('never shows one handle removed and another added within a tile, except at a strike or a death', async () => {
    const m = await night();
    const log = watch(m, 2);
    // Observer (Bot2) stays in the tavern; the Killer walks in and out of it disguised.
    teleport(m, m.bots[2]!, 'tavern_bar', 6, 4);
    for (const i of [1, 3, 4]) teleport(m, m.bots[i]!, 'overworld', 33 + i, 22);
    settle(m, ...m.bots);
    await sleep(300);
    await impersonate(m, idOf(m, 3)); // in company: pending
    await sleep(100);
    enterScene(m.room, seat(m, 0), sim(m, 0), 'tavern_bar', 'front', true); // applied at the door
    await sleep(900);
    await impersonate(m, 'nobody'); // second use: waits, the observer is in the scene
    await sleep(200);
    enterScene(m.room, seat(m, 0), sim(m, 0), 'overworld', 'tavern_front', true); // dropped at the door
    await sleep(900);
    log.allow(true);
    teleport(m, m.bots[1]!, 'overworld', 31, 22);
    settle(m, m.bots[1]!);
    markDead(m.room, idOf(m, 1), 'knife', idOf(m, 0));
    await sleep(300);
    log.allow(false);
    expect(log.swaps).toEqual([]);
  });

  it('an observer elsewhere sees no difference between a run with and without the impersonation', async () => {
    const run = async (disguiseIt: boolean) => {
      const m = await night();
      aloneInOverworld(m);
      if (disguiseIt) {
        await impersonate(m, idOf(m, 3));
        expect(await until(() => disguise(m)?.applied === true)).toBe(true);
        await impersonate(m, 'nobody');
        expect(await until(() => disguise(m) === undefined)).toBe(true);
      } else {
        await sleep(600);
      }
      await sleep(300);
      const memory = avatarMemory(m.room);
      const ids = [...m.room.state.players.keys()];
      const norm = (id: string | undefined): string => `S${ids.indexOf(id ?? '')}`;
      // Round 10, x5 (A353): the scene's figures share the view and walk on the clock, so two runs hold them at
      // different spots; only their rows are left out, the seats' rows compare as before.
      const rows = seatAvatarsHeld(m, m.bots[2]!)
        .map((a) => ({
          seat: norm(memory.seatOf.get(a.handle)),
          lookOf: norm(a.avatar.lookOf),
          height: a.avatar.height,
          x: a.avatar.x,
          y: a.avatar.y,
          statusBits: a.avatar.statusBits,
        }))
        .sort((a, b) => a.seat.localeCompare(b.seat));
      const roster2 = [1, 2, 3, 4].map((i) => ({ ...roster(m, 2, i), id: norm(idOf(m, i)) }));
      await colyseus.cleanup();
      return JSON.stringify({ rows, roster: roster2 });
    };
    const with_ = await run(true);
    const without = await run(false);
    expect(with_).toBe(without);
  });
});
