import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { economy, scenes } from '@wdi/content';
import {
  C2S,
  ClueKind,
  S2C,
  TICK_RATE,
  TILE_PX,
  type LockAttempt,
  type LockpickPublic,
  type RefusalFrame,
} from '@wdi/shared';
import { balanceOf } from '../src/sim/economy/purse';
import { addStack, count } from '../src/sim/Inventory';
import { briefingLine } from '../src/sim/law/Briefing';
import { advance, bootNpcServer, pauseClock, placeSeat, send, standardParty, type Party } from './npcHelpers';
import { fixSeeds } from './seedHelpers';
import { sleep } from './simHelpers';

// Round 10 (D5; GDD 3.29): the lock-pick on the manor study door. The hold opens a mini-game that sends the picker the
// pins and their set points; the trace it answers with is replayed on the server.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const DOOR = 'mu.study_door';

async function atDoor(picks: number, humans = 1): Promise<Party> {
  const p = await standardParty(colyseus, 'S1', false, humans);
  pauseClock(p.room);
  const human = p.humans[0]!;
  placeSeat(p, human.id, 'manor_upper', 6, 9);
  const seat = p.room.state.players.get(human.id)!;
  seat.priv.inventory.slots.clear();
  if (picks > 0) addStack(seat, 'lockpicks', picks);
  advance(p, 1);
  return p;
}

async function pick(p: Party): Promise<void> {
  await send(p.humans[0]!, C2S.hold, { action: 'interact', targetId: DOOR, on: true }, 60);
  advance(p, 1);
  await sleep(80);
}

const starts = (p: Party) => p.humans[0]!.log.filter((m) => m.type === S2C.minigameStart);
const refusals = (p: Party): RefusalFrame[] =>
  p.humans[0]!.log.filter((m) => m.type === 'error').map((m) => m.payload as RefusalFrame);
const doorState = (p: Party) => p.room.state.scenes.get('manor_upper')!.propStates.get(DOOR)?.state;

async function answer(p: Party, trace: LockAttempt[], waitS = 4): Promise<void> {
  advance(p, Math.round(waitS * TICK_RATE));
  await send(p.humans[0]!, 'minigame.result', { taskId: DOOR, answer: { trace } }, 80);
  advance(p, 1);
  await sleep(80);
}

const honest = (pub: LockpickPublic, tension = 0.3): LockAttempt[] =>
  pub.setPoints.map((s, pin) => ({ t: 1 + pin, pin, lift: s, tension }));

describe('the lock-pick', () => {
  it('refuses a seat without picks NEED_TOOL and opens nothing', async () => {
    const p = await atDoor(0);
    await pick(p);
    expect(refusals(p).at(-1)).toMatchObject({ reason: 'NEED_TOOL' });
    expect(starts(p)).toHaveLength(0);
  });

  it('sends the picker the pins, set points and band, and opens the door on a full trace', async () => {
    const p = await atDoor(1);
    await pick(p);
    expect(starts(p)).toHaveLength(1);
    const msg = starts(p)[0]!.payload as { taskId: string; kind: string; public: LockpickPublic };
    expect(msg).toMatchObject({ taskId: DOOR, kind: 'lockpick' });
    expect(msg.public.pins).toBe(3);
    expect(msg.public.setPoints).toHaveLength(3);
    await answer(p, honest(msg.public));
    expect(doorState(p)).toBe('open');
    expect(count(p.room.state.players.get(p.humans[0]!.id)!, 'lockpicks')).toBe(1);
  });

  it('snaps the pick on too much tension: one Lockpicks gone, PICK_SNAPPED, the door still locked', async () => {
    const p = await atDoor(2);
    await pick(p);
    const pub = (starts(p)[0]!.payload as { public: LockpickPublic }).public;
    await answer(p, [{ t: 1, pin: 0, lift: pub.setPoints[0]!, tension: 0.95 }]);
    expect(refusals(p).at(-1)).toMatchObject({ reason: 'PICK_SNAPPED' });
    expect(count(p.room.state.players.get(p.humans[0]!.id)!, 'lockpicks')).toBe(1);
    expect(doorState(p)).toBeUndefined();
  });

  it('asks again on a trace that leaves a pin unset, and keeps the board open', async () => {
    const p = await atDoor(1);
    await pick(p);
    const pub = (starts(p)[0]!.payload as { public: LockpickPublic }).public;
    await answer(p, honest(pub).slice(0, 2));
    expect(refusals(p).at(-1)).toMatchObject({ reason: 'BAD_REQUEST' });
    await answer(p, honest(pub));
    expect(doorState(p)).toBe('open');
  });

  it('deals the same set points to a second attempt on the same lock', async () => {
    const p = await atDoor(2);
    await pick(p);
    const first = (starts(p)[0]!.payload as { public: LockpickPublic }).public;
    await pick(p);
    const second = (starts(p).at(-1)!.payload as { public: LockpickPublic }).public;
    expect(second.setPoints).toEqual(first.setPoints);
  });

  it('refuses a perfect trace sent the moment the board opens, then opens the door once the time has passed', async () => {
    const p = await atDoor(1);
    await pick(p);
    const pub = (starts(p)[0]!.payload as { public: LockpickPublic }).public;
    await answer(p, honest(pub), 0);
    expect(refusals(p).at(-1)).toMatchObject({ reason: 'BAD_REQUEST' });
    expect(doorState(p)).toBeUndefined();
    await answer(p, honest(pub), 4);
    expect(doorState(p)).toBe('open');
  });

  it('tells nobody else: a second human gets no minigameStart and a noise with no seat id', async () => {
    const p = await atDoor(1, 2);
    const other = p.humans[1]!;
    placeSeat(p, other.id, 'manor_upper', 7, 9);
    advance(p, 1);
    await pick(p);
    expect(other.log.filter((m) => m.type === S2C.minigameStart)).toHaveLength(0);
    const heard = other.log.filter((m) => m.type === S2C.noise);
    expect(heard.length).toBeGreaterThan(0);
    for (const m of heard)
      expect(Object.keys(m.payload as object).sort()).toEqual(['kind', 'sceneId', 'x', 'y']);
  });

  describe('what an opened lock leaves', () => {
    // First draws of the `locks` stream keyed `fine`: under fineChance (0.1), and over it.
    const CAUGHT = [2, 6, 14, 22] as const;
    const UNSEEN = [1, 2, 3, 4] as const;

    async function openIt(words: readonly [number, number, number, number]) {
      const p = await atDoor(1);
      fixSeeds(p.room, { locks: words });
      const id = p.humans[0]!.id;
      const before = balanceOf(p.room, id);
      await pick(p);
      const pub = (starts(p)[0]!.payload as { public: LockpickPublic }).public;
      await answer(p, honest(pub));
      expect(doorState(p)).toBe('open');
      return { p, id, before };
    }

    it('leaves a scratch on the door tile that shows nothing of the picker', async () => {
      const { p } = await openIt(UNSEEN);
      const door = scenes.manor_upper.props.find((q) => q.id === DOOR)!;
      const marks = [...p.room.state.scenes.get('manor_upper')!.clues.values()].filter(
        (c) => c.kind === ClueKind.scratch,
      );
      expect(marks).toHaveLength(1);
      expect([marks[0]!.value, marks[0]!.dir]).toEqual([0, 0]);
      expect([Math.floor(marks[0]!.x / TILE_PX), Math.floor(marks[0]!.y / TILE_PX)]).toEqual([
        door.x,
        door.y,
      ]);
    });

    it('fines the picker when the roll on the locks stream falls under fineChance, and only then', async () => {
      const caught = await openIt(CAUGHT);
      expect(caught.before).toBeGreaterThan(0);
      expect(balanceOf(caught.p.room, caught.id)).toBe(
        caught.before - Math.min(economy.trespassFine, caught.before),
      );
      await colyseus.cleanup();
      const unseen = await openIt(UNSEEN);
      expect(balanceOf(unseen.p.room, unseen.id)).toBe(unseen.before);
    });
  });

  it('is briefed by the Constables as a kind and a scene, with no trait', () => {
    const line = briefingLine({ sceneId: 'manor_upper', kind: ClueKind.scratch, value: 0 }, true);
    expect(line.toLowerCase()).toContain('scratches');
    expect(line).toContain(scenes.manor_upper.name);
    expect(line).toBe(briefingLine({ sceneId: 'manor_upper', kind: ClueKind.scratch, value: 0 }, false));
  });
});
