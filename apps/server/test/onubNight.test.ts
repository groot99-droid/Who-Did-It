import type { ColyseusTestServer } from '@colyseus/testing';
import { onubBalance } from '@wdi/content';
import { LOFT_SCENE_INDEX, Phase, applyNightAct } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootFlowServer } from './flowHelpers';
import {
  botDealt,
  botsDealt,
  codes,
  doAct,
  endWindow,
  events,
  onub,
  openWindow,
  plate,
  presencesSeen,
  scenesSeen,
  standAtProp,
  startOnub,
  toNight,
  until,
} from './onubHelpers';
import { type Match, sleep } from './simHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Every window of the 8-seat deck has its role at a known seat; the dead's loaves are Mourner, Mourner, Debtor. */
const RIG8 = {
  Bot0: 'poisoner',
  Bot1: 'poisoner',
  Bot2: 'sinEater',
  Bot3: 'cutpurse',
  Bot4: 'busybody',
  Bot5: 'hireling',
  Bot6: 'lamplighter',
  Bot7: 'sot',
};
const ORDER = ['poisoner', 'hireling', 'sinEater', 'cutpurse', 'busybody', 'sot', 'lamplighter'];

const publicScenes = (m: Match): number[] => {
  const out: number[] = [];
  m.room.state.players.forEach((p) => out.push(p.sceneId));
  return out;
};

async function skipFade(m: Match): Promise<void> {
  const o = onub(m);
  if (o.stage === 'fade') o.stageEndsTick = m.room.state.tick;
  await sleep(250);
}

describe('what a sleeper receives (A39)', () => {
  /** Opens `role`'s window by `open`, diffs every client, then closes it. */
  async function observe(m: Match, role: string, open: () => Promise<void>): Promise<void> {
    const before = m.bots.map((b) => ({
      enters: events(b, 'sceneEnter').length,
      wakes: events(b, 'nightWake').length,
      reveals: events(b, 'nightReveal').length,
    }));
    // The first window of a night opens by itself, possibly before we look.
    const o = onub(m);
    const already = o.stage === 'window' && o.script[o.windowIdx]?.role === role ? 1 : 0;
    await open();
    const wakers = botsDealt(m, role);
    m.bots.forEach((b, i) => {
      const awake = wakers.includes(b);
      expect(publicScenes(m).every((s) => s === LOFT_SCENE_INDEX)).toBe(true);
      if (awake) {
        expect(scenesSeen(b)).toEqual(['bakery']);
        expect(events(b, 'nightWake')).toHaveLength(before[i]!.wakes + 1 - already);
        expect(events(b, 'nightWake').at(-1)).toMatchObject({ windowRole: role, spawn: 'door' });
        // Co-wakers see each other, and nobody else.
        expect(presencesSeen(m, b)).toEqual(
          wakers
            .filter((w) => w !== b)
            .map((w) => w.id)
            .sort(),
        );
      } else {
        expect(scenesSeen(b)).toEqual([]);
        expect(presencesSeen(m, b)).toEqual([]);
        expect(events(b, 'nightWake')).toHaveLength(before[i]!.wakes);
        expect(events(b, 'sceneEnter')).toHaveLength(before[i]!.enters);
        expect(events(b, 'nightReveal')).toHaveLength(before[i]!.reveals);
      }
    });
    await endWindow(m);
    for (const b of m.bots) {
      expect(scenesSeen(b)).toEqual([]);
      expect(presencesSeen(m, b)).toEqual([]);
    }
    for (const b of wakers) expect(events(b, 'nightSleep').length).toBeGreaterThanOrEqual(2);
  }

  it("sees no presence, scene, sceneEnter, nightWake or sceneId change during another role's window (windows in turn)", async () => {
    const m = await startOnub(colyseus, 8, RIG8);
    await toNight(m);
    for (const role of ORDER) {
      await observe(m, role, async () => {
        // In turn: the fade after the previous window runs out, the next one opens by itself.
        await skipFade(m);
        expect(
          await until(() => onub(m).stage === 'window' && onub(m).script[onub(m).windowIdx]?.role === role),
        ).toBe(true);
        await sleep(250);
      });
    }
    await skipFade(m);
    expect(await until(() => m.room.state.phase === Phase.dawn)).toBe(true);
    expect(onub(m).stage).toBe('done');
  }, 60_000);

  it('sees the same when the Conductor is jumped with {window}', async () => {
    const m = await startOnub(colyseus, 8, RIG8);
    await toNight(m);
    for (const role of ['lamplighter', 'cutpurse', 'poisoner'])
      await observe(m, role, () => openWindow(m, role));
  });

  it("refuses a sleeper's portal, hold and report and leaves its view empty", async () => {
    const m = await startOnub(colyseus, 8, RIG8);
    await toNight(m);
    await openWindow(m, 'poisoner');
    const sleeper = botDealt(m, 'busybody');
    sleeper.room.send('act.enterPortal', { portalId: 'bk.door' });
    sleeper.room.send('act.hold', { action: 'collect', targetId: 'clue_x', on: true });
    sleeper.room.send('act.reportBody', { bodyId: 'nobody' });
    await sleep(300);
    expect(codes(sleeper)).toHaveLength(3);
    expect(codes(sleeper).every((c) => c === 425 || c === 422)).toBe(true);
    expect(codes(sleeper)).toContain(425); // the portal; hold and report answer 422 ("not now") from the loft
    expect(scenesSeen(sleeper)).toEqual([]);
    expect(presencesSeen(m, sleeper)).toEqual([]);
  });

  it('shows nobody who woke on the roster after the night either', async () => {
    const m = await startOnub(colyseus, 8, RIG8);
    await toNight(m);
    await openWindow(m, 'sinEater');
    await endWindow(m);
    leaderSend(m, { phase: 'dawn' });
    expect(await until(() => m.room.state.phase === Phase.dawn)).toBe(true);
    await sleep(200);
    expect(publicScenes(m).every((s) => s === LOFT_SCENE_INDEX)).toBe(true);
    for (const b of m.bots) expect(scenesSeen(b)).toEqual([]);
  });
});

function leaderSend(m: Match, payload: Record<string, unknown>): void {
  m.bots[0]!.room.send('debug.clock', payload);
}

describe('night acts (GDD 3.11)', () => {
  const loaf = (m: Match, propId: string) => onub(m).loaves.get(propId);

  it("Sin-Eater tastes one mourner's loaf, or two of the dead's, but never its own plate", async () => {
    const m = await startOnub(colyseus, 8, RIG8);
    await toNight(m);
    await openWindow(m, 'sinEater');
    const eater = botDealt(m, 'sinEater');
    const victim = botDealt(m, 'cutpurse');
    standAtProp(m, eater, plate(m, eater));
    await doAct(eater, 'onub.peekPlate', plate(m, eater));
    expect(codes(eater)).toEqual([422]);
    standAtProp(m, eater, plate(m, victim));
    await doAct(eater, 'onub.peekPlate', plate(m, victim));
    expect(events(eater, 'nightReveal').at(-1)?.entries).toEqual([
      { slot: plate(m, victim), of: victim.id, roleId: 'cutpurse' },
    ]);
    expect(codes(eater)).toEqual([422]);
    // One act per window.
    await doAct(eater, 'onub.peekPlate', plate(m, victim));
    expect(codes(eater)).toEqual([422, 422]);
    await endWindow(m);

    await openWindow(m, 'sinEater');
    standAtProp(m, eater, 'bk.deadloaf_1');
    await doAct(eater, 'onub.peekDead', 'bk.deadloaf_0', 'bk.deadloaf_2');
    const entries = events(eater, 'nightReveal').at(-1)?.entries as {
      slot: string;
      of: string;
      roleId: string;
    }[];
    expect(entries.map((e) => [e.slot, e.of])).toEqual([
      ['bk.deadloaf_0', ''],
      ['bk.deadloaf_2', ''],
    ]);
    expect(entries.map((e) => e.roleId)).toEqual([loaf(m, 'bk.deadloaf_0'), loaf(m, 'bk.deadloaf_2')]);
    expect(onub(m).swapLog).toEqual([]);
  });

  it("Cutpurse takes another plate's loaf, reads it, and the swap is logged", async () => {
    const m = await startOnub(colyseus, 8, RIG8);
    await toNight(m);
    await openWindow(m, 'cutpurse');
    const thief = botDealt(m, 'cutpurse');
    const mark = botDealt(m, 'lamplighter');
    standAtProp(m, thief, plate(m, mark));
    await doAct(thief, 'onub.take', plate(m, mark));
    expect(events(thief, 'nightReveal').at(-1)?.entries).toEqual([
      { slot: plate(m, mark), of: mark.id, roleId: 'lamplighter' },
    ]);
    expect(loaf(m, plate(m, thief))).toBe('lamplighter');
    expect(loaf(m, plate(m, mark))).toBe('cutpurse');
    expect(onub(m).swapLog).toEqual([
      { order: 5, roleId: 'cutpurse', act: 'onub.take', slots: [plate(m, thief), plate(m, mark)] },
    ]);
    // The roster and the private reveal rows agree.
    expect(m.room.state.players.get(thief.id)?.priv?.nightReveal.map((e) => e.roleId)).toEqual([
      'lamplighter',
    ]);
  });

  it('Busybody swaps two other plates without looking and cannot touch its own', async () => {
    const m = await startOnub(colyseus, 8, RIG8);
    await toNight(m);
    await openWindow(m, 'busybody');
    const body = botDealt(m, 'busybody');
    const [a, b] = [botDealt(m, 'sinEater'), botDealt(m, 'hireling')];
    standAtProp(m, body, plate(m, a));
    await doAct(body, 'onub.swapPlates', plate(m, a));
    expect(codes(body)).toEqual([422]); // a pair needs two
    await doAct(body, 'onub.swapPlates', plate(m, a), plate(m, body));
    expect(codes(body)).toEqual([422, 422]); // never its own plate
    await doAct(body, 'onub.swapPlates', plate(m, a), plate(m, a));
    expect(codes(body)).toEqual([422, 422, 422]);
    await doAct(body, 'onub.swapPlates', plate(m, a), plate(m, b));
    expect(codes(body)).toEqual([422, 422, 422]);
    expect(loaf(m, plate(m, a))).toBe('hireling');
    expect(loaf(m, plate(m, b))).toBe('sinEater');
    expect(events(body, 'nightReveal')).toHaveLength(0);
    expect(onub(m).swapLog).toEqual([
      { order: 6, roleId: 'busybody', act: 'onub.swapPlates', slots: [plate(m, a), plate(m, b)] },
    ]);
  });

  it('Sot swaps its loaf with a dead one by choice, and by seed when the window runs out', async () => {
    const m = await startOnub(colyseus, 8, RIG8);
    await toNight(m);
    await openWindow(m, 'sot');
    const sot = botDealt(m, 'sot');
    const before = loaf(m, 'bk.deadloaf_1');
    standAtProp(m, sot, plate(m, sot));
    await doAct(sot, 'onub.swapDead', 'bk.deadloaf_1');
    expect(codes(sot)).toEqual([427]); // the ledge is across the room
    standAtProp(m, sot, 'bk.deadloaf_1');
    await doAct(sot, 'onub.swapDead', plate(m, sot));
    expect(codes(sot)).toEqual([427, 422]); // only the dead's loaves
    await doAct(sot, 'onub.swapDead', 'bk.deadloaf_1');
    expect(loaf(m, plate(m, sot))).toBe(before);
    expect(loaf(m, 'bk.deadloaf_1')).toBe('sot');
    expect(events(sot, 'nightReveal')).toHaveLength(0);
    await endWindow(m);

    // A second Sot who never acts: the window's end picks a dead loaf by seed.
    const m2 = await startOnub(colyseus, 8, RIG8);
    await toNight(m2);
    await openWindow(m2, 'sot');
    await endWindow(m2);
    const log = onub(m2).swapLog;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ order: 7, roleId: 'sot', act: 'onub.swapDead' });
    expect(log[0]!.slots[0]).toBe(plate(m2, botDealt(m2, 'sot')));
    expect(log[0]!.slots[1]).toMatch(/^bk\.deadloaf_[0-2]$/);
    expect(onub(m2).loaves.get(plate(m2, botDealt(m2, 'sot')))).not.toBe('sot');
  });

  it('Lamplighter reads its own plate as it stands after the night so far', async () => {
    const m = await startOnub(colyseus, 8, RIG8);
    await toNight(m);
    await openWindow(m, 'cutpurse');
    const thief = botDealt(m, 'cutpurse');
    const lamp = botDealt(m, 'lamplighter');
    standAtProp(m, thief, plate(m, lamp));
    await doAct(thief, 'onub.take', plate(m, lamp));
    await endWindow(m);
    await openWindow(m, 'lamplighter');
    standAtProp(m, lamp, plate(m, lamp));
    await doAct(lamp, 'onub.check', plate(m, thief)); // not its plate
    expect(codes(lamp)).toEqual([422]);
    await doAct(lamp, 'onub.check', plate(m, lamp));
    expect(events(lamp, 'nightReveal').at(-1)?.entries).toEqual([
      { slot: plate(m, lamp), of: lamp.id, roleId: 'cutpurse' },
    ]);
  });

  it('a lone Poisoner may peek a dead loaf; two Poisoners may not', async () => {
    const m = await startOnub(colyseus, 8, RIG8);
    await toNight(m);
    await openWindow(m, 'poisoner');
    const p0 = botsDealt(m, 'poisoner')[0]!;
    standAtProp(m, p0, 'bk.deadloaf_0');
    await doAct(p0, 'onub.peekDead', 'bk.deadloaf_0');
    expect(codes(p0)).toEqual([422]);

    const alone = await startOnub(colyseus, 6, {
      Bot0: 'poisoner',
      Bot1: 'cutpurse',
      Bot2: 'sinEater',
      Bot3: 'busybody',
      Bot4: 'hireling',
      Bot5: 'debtor',
    });
    await toNight(alone);
    await openWindow(alone, 'poisoner');
    const lone = botDealt(alone, 'poisoner');
    standAtProp(alone, lone, 'bk.deadloaf_2');
    await doAct(lone, 'onub.peekDead', 'bk.deadloaf_2');
    expect(events(lone, 'nightReveal').at(-1)?.entries).toEqual([
      { slot: 'bk.deadloaf_2', of: '', roleId: onub(alone).loaves.get('bk.deadloaf_2') },
    ]);
    expect(presencesSeen(alone, lone)).toEqual([]);
  });

  it("refuses an act outside the actor's own window 425, and one from a seat of another role 425", async () => {
    const m = await startOnub(colyseus, 8, RIG8);
    const thief = botDealt(m, 'cutpurse');
    standAtProp(m, thief, plate(m, botDealt(m, 'sinEater')));
    await doAct(thief, 'onub.take', plate(m, botDealt(m, 'sinEater'))); // dusk
    expect(codes(thief)).toEqual([425]);
    await toNight(m);
    await openWindow(m, 'sinEater');
    await doAct(thief, 'onub.take', plate(m, botDealt(m, 'sinEater'))); // someone else's window
    expect(codes(thief)).toEqual([425, 425]);
    await endWindow(m);
    await doAct(botDealt(m, 'sinEater'), 'onub.peekPlate', plate(m, thief)); // after its window
    expect(codes(botDealt(m, 'sinEater'))).toEqual([425]);
  });

  it('keeps the swap log replayable from the dealt loaves to the final ones across a whole night', async () => {
    const m = await startOnub(colyseus, 8, RIG8);
    const start = new Map(onub(m).loaves);
    await toNight(m);
    const [thief, body, lamp] = [
      botDealt(m, 'cutpurse'),
      botDealt(m, 'busybody'),
      botDealt(m, 'lamplighter'),
    ];
    const [eater, hireling, sot] = [botDealt(m, 'sinEater'), botDealt(m, 'hireling'), botDealt(m, 'sot')];
    await openWindow(m, 'cutpurse');
    standAtProp(m, thief, plate(m, eater));
    await doAct(thief, 'onub.take', plate(m, eater));
    await endWindow(m);
    await openWindow(m, 'busybody');
    standAtProp(m, body, plate(m, hireling));
    await doAct(body, 'onub.swapPlates', plate(m, hireling), plate(m, lamp));
    await endWindow(m);
    await openWindow(m, 'sot');
    standAtProp(m, sot, 'bk.deadloaf_0');
    await doAct(sot, 'onub.swapDead', 'bk.deadloaf_0');
    await endWindow(m);
    expect(onub(m).swapLog.map((e) => e.act)).toEqual(['onub.take', 'onub.swapPlates', 'onub.swapDead']);
    let replay = new Map(start);
    for (const e of onub(m).swapLog) {
      replay = applyNightAct(replay, { roleId: e.roleId, act: e.act, slots: e.slots }).next;
    }
    expect([...replay]).toEqual([...onub(m).loaves]);
    expect([...replay.values()].sort()).toEqual([...start.values()].sort());
  });

  it('runs the windows by themselves when nobody acts: a whole 8-seat night ends in the dawn', async () => {
    const m = await startOnub(colyseus, 8, RIG8);
    await toNight(m);
    const o = onub(m);
    const seen: string[] = [];
    for (let i = 0; i < 40 && m.room.state.phase === Phase.night; i++) {
      if (o.stage === 'window') {
        const role = o.script[o.windowIdx]!.role;
        if (seen.at(-1) !== role) seen.push(role);
        o.stageEndsTick = m.room.state.tick;
      } else if (o.stage === 'fade') o.stageEndsTick = m.room.state.tick;
      await sleep(60);
    }
    expect(seen).toEqual(ORDER);
    expect(m.room.state.phase).toBe(Phase.dawn);
    expect(onubBalance.timers.dawnS).toBeGreaterThan(0);
    expect(m.room.state.phaseEndsTick - m.room.state.tick).toBeGreaterThan(0);
  });
});
