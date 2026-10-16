import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { abilities, balance, clues } from '@wdi/content';
import { ErrorCode, ItemStack, Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import { createServer } from '../src/server';
import { handleKill } from '../src/sim/Kill';
import { StatusBit } from '../src/sim/constants';
import {
  act,
  diffPaths,
  errorCodes,
  eventsOf,
  flatten,
  placeAtPx,
  playerOf,
  readyKnife,
  record,
  setPhase,
  simOfBot,
  sleep,
  teleport,
  tilePx,
  toDay,
} from './killHelpers';
import { type Match, startMatch, stateOf } from './simHelpers';

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  process.env.WDI_DEBUG = '1';
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => colyseus.cleanup());

const RANGE = (abilities.abilities.kill?.rangeTiles ?? 0) * TILE_PX;
// Row 22 of the overworld is open from x 22 to 39: killer at tile 30, victims along the row.
const ROW = 22;

async function party(n = 5): Promise<Match> {
  const m = await startMatch(colyseus, n, {
    Bot0: 'killer',
    Bot1: 'townsfolk',
    Bot2: 'detective',
    Bot3: 'doctor',
  });
  toDay(m);
  readyKnife(m, m.bots[0]!);
  teleport(m, m.bots[0]!, 'overworld', 30, ROW);
  teleport(m, m.bots[1]!, 'overworld', 31, ROW);
  for (const i of [2, 3, 4]) if (m.bots[i]) teleport(m, m.bots[i]!, 'overworld', 36 + i, 18);
  return m;
}

const strike = (m: Match, i = 1) =>
  act(m.bots[0]!, 'act.ability', { abilityId: 'kill', targetId: m.bots[i]!.id });

describe('kill', () => {
  it('kills a target in reach: ghost flag, body, clues, Blood, cooldown, scream, private killed', async () => {
    const m = await party();
    const [k, v, w, far] = [m.bots[0]!, m.bots[1]!, m.bots[2]!, m.bots[4]!];
    teleport(m, w, 'overworld', 29, ROW);
    const rec = record(m);
    await sleep(300);
    const tick = m.room.state.tick;
    await strike(m);

    expect(errorCodes(k)).toEqual([]);
    expect(simOfBot(m, v).dead).toBe(true);
    expect(playerOf(m, v).alive).toBe(true); // public until the next meeting (A30)
    expect(rec.deaths).toEqual([
      { playerId: v.id, cause: 'knife', killerId: k.id, tick: expect.any(Number) },
    ]);
    expect(rec.deaths[0]!.tick).toBeGreaterThanOrEqual(tick);

    const killed = eventsOf(v, 'killed') as Array<{
      sceneId: string;
      cause: string;
      roles: Record<string, string>;
    }>;
    expect(killed).toHaveLength(1);
    expect(killed[0]).toMatchObject({ sceneId: 'overworld', cause: 'knife' });
    expect(killed[0]!.roles[k.id]).toBe('killer');
    expect(Object.keys(killed[0]!.roles)).toHaveLength(5);
    expect(eventsOf(w, 'killed')).toEqual([]);

    const body = m.room.state.scenes.get('overworld')!.bodies.get(`body_${v.id}`)!;
    expect(body).toMatchObject({
      of: v.id,
      hidden: false,
      x: Math.round(tilePx(31)),
      y: Math.round(tilePx(ROW)),
    });
    // Both kill clues sit in the scene, ids from its own counter (the teaching clue has a fixed id).
    const ids = [...m.room.state.scenes.get('overworld')!.clues.keys()].sort();
    expect(ids).toEqual(['clue_overworld_1', 'clue_overworld_2', 'clue_teaching']);

    const decay = clues.clues.blood?.decay;
    const sim = simOfBot(m, k);
    expect(decay?.kind === 'seconds' && sim.bloodyUntilTick - tick).toBeGreaterThanOrEqual(
      (decay?.kind === 'seconds' ? decay.seconds : 0) * TICK_RATE - 5,
    );
    await sleep(200);
    expect(playerOf(m, k).presence.statusBits & StatusBit.bloody).toBe(StatusBit.bloody);
    expect(playerOf(m, v).presence.statusBits & StatusBit.bloody).toBe(0);

    const cd = balance.byCount['5'].killCooldownS * TICK_RATE;
    expect(playerOf(m, k).priv.cooldownEndTick.get('kill')).toBeGreaterThanOrEqual(tick + cd);
    // The scream rings for the bystander in the scene within the radius, not for the far bot, nor the killer.
    expect(eventsOf(w, 'noise')).toEqual([expect.objectContaining({ kind: 'scream', sceneId: 'overworld' })]);
    expect(eventsOf(far, 'noise')).toEqual([]);
    expect(eventsOf(k, 'noise')).toEqual([]);

    // A second strike on the ghost, and any strike on cooldown, is refused.
    await strike(m);
    expect(errorCodes(k)).toEqual([ErrorCode.cooldown]);
  });

  it('refuses a non-Killer, a bad payload, self and unknown targets', async () => {
    const m = await party();
    const [k, v, det] = [m.bots[0]!, m.bots[1]!, m.bots[2]!];
    teleport(m, det, 'overworld', 29, ROW);
    await act(det, 'act.ability', { abilityId: 'kill', targetId: v.id });
    expect(errorCodes(det)).toEqual([ErrorCode.cannot]);
    for (const payload of [
      {},
      { abilityId: 'kill' },
      { abilityId: 'kill', targetId: 7 },
      { abilityId: 'kill', targetId: k.id },
      { abilityId: 'kill', targetId: 'nobody' },
      { abilityId: 5 },
    ]) {
      await act(k, 'act.ability', payload);
    }
    expect(errorCodes(k)).toEqual(Array(6).fill(ErrorCode.cannot));
    expect(simOfBot(m, v).dead).toBe(false);
  });

  it('refuses in grace and immunity (425), keeps day, dusk and night open', async () => {
    const m = await party();
    const k = m.bots[0]!;
    for (const phase of [Phase.grace, Phase.immunity, Phase.meetingDiscussion]) {
      setPhase(m, phase);
      await strike(m);
    }
    expect(errorCodes(k)).toEqual([ErrorCode.wrongPhase, ErrorCode.wrongPhase, ErrorCode.wrongPhase]);
    expect(simOfBot(m, m.bots[1]!).dead).toBe(false);
    for (const [phase, i] of [
      [Phase.dusk, 1],
      [Phase.night, 2],
    ] as const) {
      setPhase(m, phase);
      readyKnife(m, k);
      teleport(m, m.bots[i]!, 'overworld', 31, ROW);
      await strike(m, i);
      expect(simOfBot(m, m.bots[i]!).dead).toBe(true);
    }
  });

  it('refuses a busy actor (426), a cooldown (424), and a target in transit', async () => {
    const m = await party();
    const k = m.bots[0]!;
    simOfBot(m, k).busyUntilTick = m.room.state.tick + 200;
    await strike(m);
    simOfBot(m, k).busyUntilTick = 0;
    playerOf(m, k).priv.cooldownEndTick.set('kill', m.room.state.tick + 200);
    await strike(m);
    readyKnife(m, k);
    simOfBot(m, m.bots[1]!).busyUntilTick = m.room.state.tick + 200;
    await strike(m);
    expect(errorCodes(k)).toEqual([ErrorCode.busy, ErrorCode.cooldown, ErrorCode.cannot]);
  });

  it('respects the reach, with and without the ring slack', async () => {
    const m = await party();
    const [k, v] = [m.bots[0]!, m.bots[1]!];
    const kp = simOfBot(m, k);
    const vp = simOfBot(m, v);
    await sleep(300);
    // Standing still, the edge of the reach is exact.
    placeAtPx(m, k, tilePx(30), tilePx(ROW));
    placeAtPx(m, v, tilePx(30) + RANGE + 2, tilePx(ROW));
    handleKill(m.room, k.id, { abilityId: 'kill', targetId: v.id });
    expect(vp.dead).toBe(false);
    placeAtPx(m, v, tilePx(30) + RANGE - 2, tilePx(ROW));
    // The same distance becomes valid after the victim just ran 40 px (the 250 ms ring).
    placeAtPx(m, v, tilePx(30) + RANGE - 38, tilePx(ROW));
    vp.x = tilePx(30) + RANGE + 2;
    vp.pushRing();
    expect(Math.hypot(vp.x - kp.x, vp.y - kp.y)).toBeGreaterThan(RANGE);
    handleKill(m.room, k.id, { abilityId: 'kill', targetId: v.id });
    expect(vp.dead).toBe(true);
    await sleep(200);
    expect(errorCodes(k)).toEqual([ErrorCode.outOfRange]);
  });

  it('refuses a strike through a wall and across scenes', async () => {
    const m = await party();
    const [k, v] = [m.bots[0]!, m.bots[1]!];
    await sleep(300);
    // Tile (27,23) is a single solid tile: 10 px either side of it is 84 px, inside the reach.
    placeAtPx(m, k, 27 * TILE_PX - 10, tilePx(23));
    placeAtPx(m, v, 28 * TILE_PX + 10, tilePx(23));
    handleKill(m.room, k.id, { abilityId: 'kill', targetId: v.id });
    await sleep(200);
    expect(simOfBot(m, v).dead).toBe(false);
    expect(errorCodes(k)).toEqual([ErrorCode.cannot]);
    teleport(m, v, 'tavern_bar', 4, 4);
    placeAtPx(m, v, tilePx(30), tilePx(22));
    await strike(m);
    expect(errorCodes(k)).toEqual([ErrorCode.cannot, ErrorCode.cannot]);
  });

  it('voids a Bandaged strike: 422, bandage spent, Blood gained, cooldown restarted', async () => {
    const m = await party();
    const [k, v] = [m.bots[0]!, m.bots[1]!];
    const vp = simOfBot(m, v);
    vp.bandagedUntilTick = m.room.state.tick + 1000;
    const rec = record(m);
    await strike(m);
    expect(errorCodes(k)).toEqual([ErrorCode.cannot]);
    expect(vp.dead).toBe(false);
    expect(vp.bandagedUntilTick).toBe(0);
    expect(rec.deaths).toEqual([]);
    expect(simOfBot(m, k).bloodyUntilTick).toBeGreaterThan(m.room.state.tick);
    expect(playerOf(m, k).priv.cooldownEndTick.get('kill')).toBeGreaterThan(m.room.state.tick);
    expect(m.room.state.scenes.get('overworld')!.bodies.size).toBe(0);
    // The next strike waits for the cooldown.
    await strike(m);
    expect(errorCodes(k)).toEqual([ErrorCode.cannot, ErrorCode.cooldown]);
  });
});

describe('the Doctor bandage', () => {
  it('protects the next strike for protectS, costs one bandage and rests for its cooldown', async () => {
    const m = await party();
    const [doc, v] = [m.bots[3]!, m.bots[1]!];
    teleport(m, doc, 'overworld', 32, ROW);
    const kit = new ItemStack();
    kit.defId = 'bandage';
    kit.qty = 2;
    playerOf(m, doc).priv.inventory.slots.push(kit); // white-box roles carry no start kit
    const stock = () => playerOf(m, doc).priv.inventory.slots.find((s) => s.defId === 'bandage')?.qty ?? 0;
    expect(stock()).toBe(2);
    const tick = m.room.state.tick;
    await act(doc, 'act.ability', { abilityId: 'bandage', targetId: v.id });
    expect(errorCodes(doc)).toEqual([]);
    expect(stock()).toBe(1);
    const def = abilities.abilities.bandage!;
    expect(simOfBot(m, v).bandagedUntilTick - tick).toBeGreaterThanOrEqual(
      (def.params?.protectS ?? 0) * TICK_RATE - 5,
    );
    expect(playerOf(m, doc).priv.cooldownEndTick.get('bandage')).toBeGreaterThan(tick);
    await act(doc, 'act.ability', { abilityId: 'bandage', targetId: v.id });
    expect(errorCodes(doc)).toEqual([ErrorCode.cooldown]);
    expect(stock()).toBe(1);
  });

  it('refuses self, a far target, a non-Doctor, and an empty kit', async () => {
    const m = await party();
    const [doc, v, det] = [m.bots[3]!, m.bots[1]!, m.bots[2]!];
    teleport(m, doc, 'overworld', 36, ROW);
    await act(doc, 'act.ability', { abilityId: 'bandage', targetId: doc.id });
    await act(doc, 'act.ability', { abilityId: 'bandage', targetId: v.id });
    await act(det, 'act.ability', { abilityId: 'bandage', targetId: v.id });
    expect(errorCodes(doc)).toEqual([ErrorCode.cannot, ErrorCode.outOfRange]);
    expect(errorCodes(det)).toEqual([ErrorCode.cannot]);
    teleport(m, doc, 'overworld', 32, ROW);
    await act(doc, 'act.ability', { abilityId: 'bandage', targetId: v.id });
    expect(errorCodes(doc)).toEqual([ErrorCode.cannot, ErrorCode.outOfRange, ErrorCode.cannot]);
    expect(simOfBot(m, v).bandagedUntilTick).toBe(0);
  });
});

describe('what a kill leaks (ARCHITECTURE 5.4, scoped to M3)', () => {
  it('shows outsiders no field change and insiders only the body, the clues and Blood', async () => {
    const m = await startMatch(colyseus, 5, {
      Bot0: 'killer',
      Bot1: 'townsfolk',
      Bot2: 'detective',
      Bot3: 'doctor',
    });
    toDay(m);
    const [k, v, witness, out1, out2] = m.bots as [
      Match['bots'][0],
      Match['bots'][0],
      Match['bots'][0],
      Match['bots'][0],
      Match['bots'][0],
    ];
    readyKnife(m, k);
    const open = { x: 4, y: 4 };
    teleport(m, k, 'tavern_bar', open.x, open.y);
    teleport(m, v, 'tavern_bar', open.x + 1, open.y);
    teleport(m, witness, 'tavern_bar', open.x - 1, open.y);
    teleport(m, out1, 'overworld', 30, ROW);
    teleport(m, out2, 'overworld', 34, ROW);
    await sleep(900);
    const snap = (b: typeof k) => {
      const flat = flatten(stateOf(b).toJSON());
      delete flat.tick;
      return flat;
    };
    const before = [witness, out1, out2].map(snap);
    await act(k, 'act.ability', { abilityId: 'kill', targetId: v.id }, 1000);
    expect(simOfBot(m, v).dead).toBe(true);
    const [dWitness = [], dOut1, dOut2] = [witness, out1, out2].map((b, i) => diffPaths(before[i]!, snap(b)));

    expect(dOut1).toEqual([]);
    expect(dOut2).toEqual([]);
    for (const b of [out1, out2]) expect([...stateOf(b).scenes.keys()]).toEqual(['overworld']);
    expect(dWitness.length).toBeGreaterThan(0);
    const allowed = [
      /^scenes\.tavern_bar\.bodies\./,
      /^scenes\.tavern_bar\.clues\./,
      new RegExp(`^players\\.${k.id}\\.presence\\.statusBits$`),
      new RegExp(`^players\\.${v.id}\\.presence`), // the ghost's presence may stop arriving (K, Visibility)
    ];
    expect(dWitness.filter((p) => !allowed.some((re) => re.test(p)))).toEqual([]);
    expect(stateOf(witness).players.get(k.id)?.presence?.statusBits).toBe(StatusBit.bloody);
    const body = stateOf(witness).scenes.get('tavern_bar')!.bodies.get(`body_${v.id}`);
    expect(body?.of).toBe(v.id);
    expect(stateOf(witness).scenes.get('tavern_bar')!.clues.size).toBe(2);
    // The public roster is unchanged: the victim still reads as alive until a meeting.
    expect(stateOf(witness).players.get(v.id)?.alive).toBe(true);
  });
});
