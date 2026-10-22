import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import type { Client } from '@colyseus/core';
import { balance, navs, profileFor, routines, scenes, type Scene, type SceneId } from '@wdi/content';
import { ClueKind, NavGrid, Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import { spawnBody } from '../src/sim/Bodies';
import { removeClue, spawnClue } from '../src/sim/Clues';
import { type Act, npcMemory } from '../src/sim/npc/memory';
import { stationsOf, isLitAtNight, litAtNight } from '../src/sim/npc/routine';
import { mapScenesOf } from '../src/sim/MapSites';
import { simOf, type MeetingRequest } from '../src/sim/RoomSim';
import { sceneIndex, sceneKey } from '../src/sim/World';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  npcIdsOf,
  placeSeat,
  setRole,
  standardParty,
} from './npcHelpers';
import { openRun } from './killHelpers';

// NPC routines (GDD 3.12 "Routines"; npc.md part 2, sections 2 and 4). The party is the standard one: 1 human AFK
// plus nine NPC seats under fixed ids and seeds (S1), all Townsfolk, driven with `advance` (no sleeps).

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** One NPC on one tick, as the tests read it after the step. */
export interface Sample {
  tick: number;
  scene: number;
  x: number;
  y: number;
  yaw: number;
  anim: number;
  hold: { action: string; targetId: string } | null;
  mode: string;
  act: string;
  station: string;
  busy: boolean;
  holdTries: number;
  /** The position differs from the previous tick's in the same scene. */
  moved: boolean;
  /** `react` or `fallback` mode, or in transit: left out of the stillness, moving-share and dwell checks. */
  exempt: boolean;
}

/** Records `ticks` steps of the NPCs `ids`; `before` runs once per tick before the step (white-box pokes). */
export function record(
  party: Party,
  ids: readonly string[],
  ticks: number,
  each?: (tick: number) => void,
): Map<string, Sample[]> {
  const sim = simOf(party.room);
  const mem = npcMemory(party.room);
  const out = new Map<string, Sample[]>(ids.map((id) => [id, []]));
  const prev = new Map<string, { x: number; y: number; s: number }>();
  advance(party, ticks, (tick) => {
    each?.(tick);
    for (const id of ids) {
      const p = sim.players.get(id)!;
      const player = party.room.state.players.get(id)!;
      const brain = mem.brain(id);
      const was = prev.get(id);
      const busy = tick < p.busyUntilTick;
      out.get(id)!.push({
        tick,
        scene: p.sceneIdx,
        x: p.x,
        y: p.y,
        yaw: player.presence.yaw,
        anim: player.presence.animId,
        hold: p.hold ? { action: p.hold.action, targetId: p.hold.targetId } : null,
        mode: brain.mode,
        act: brain.act?.kind ?? '',
        station: brain.act?.stationId ?? '',
        busy,
        holdTries: brain.holdTries,
        moved: !!was && was.s === p.sceneIdx && (was.x !== p.x || was.y !== p.y),
        exempt: brain.mode === 'react' || brain.mode === 'fallback' || busy,
      });
      prev.set(id, { x: p.x, y: p.y, s: p.sceneIdx });
    }
  });
  return out;
}

/** The longest run of `true` flags ending at each index, within runs of `ok`. */
function stillEnding(rows: readonly Sample[]): number[] {
  const out: number[] = [];
  let run = 0;
  for (const s of rows) {
    run = s.exempt || s.moved || s.scene < 0 ? 0 : run + 1;
    out.push(run);
  }
  return out;
}

let day: Promise<{ party: Party; rows: Map<string, Sample[]>; ids: string[] }> | null = null;
/** 600 s of held day, recorded once for R1 to R6 and P3. */
function recordedDay() {
  day ??= (async () => {
    const party = await standardParty(colyseus, 'S1');
    allTownsfolk(party.room);
    const ids = npcIdsOf('S1');
    holdPhase(party, Phase.day, 700);
    const rows = record(party, ids, 600 * TICK_RATE);
    return { party, rows, ids };
  })();
  return day;
}

const idleMin = () => Math.round(balance.npc.routine.idleS.min * TICK_RATE);

describe('the privacy rule (npc.md part 2, section 2)', () => {
  it('P1: routines.holds is empty in M5a', () => {
    expect(Object.keys(routines.holds)).toEqual([]);
  });

  it('P2: no NPC code writes a hold, an animation or a yaw', () => {
    const dir = join(__dirname, '../src/sim/npc');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const text = readFileSync(join(dir, file), 'utf8');
      expect(text, file).not.toMatch(/\.hold\s*=(?!=)/);
      expect(text, file).not.toMatch(/animId/);
      expect(text, file).not.toMatch(/\.yaw\s*=(?!=)/);
    }
  });

  it('P3: over a day no NPC holds anything but Collect on a clue, and never animates idly', async () => {
    const { party, rows } = await recordedDay();
    const sim = simOf(party.room);
    void sim;
    for (const [id, list] of rows) {
      list.forEach((s, i) => {
        if (s.hold) expect(s.hold.action, id).toBe('collect');
        expect(s.holdTries, id).toBe(0);
        const before = list[i - 1];
        // The publish runs before `runHolds`, so a start or an end shows one tick late (npc.md 4).
        if (s.anim === 4 && before)
          expect(s.hold !== null || before.hold !== null, `${id}@${s.tick}`).toBe(true);
      });
    }
  });
});

describe('routines over a held day (npc.md part 2, section 4)', () => {
  it('R1: no 400 non-exempt ticks without a still run of idleS.min', async () => {
    const { rows } = await recordedDay();
    for (const [id, list] of rows) {
      const still = stillEnding(list);
      let segStart = 0;
      let last = -1;
      for (let i = 0; i < list.length; i++) {
        if (list[i]!.exempt) {
          segStart = i + 1;
          last = -1;
          continue;
        }
        if (still[i]! >= idleMin()) last = i;
        if (i - segStart + 1 >= 400) {
          expect(
            last >= i - 399 + idleMin() - 1,
            `${id} still for ${i - last} ticks at ${list[i]!.tick}`,
          ).toBe(true);
        }
      }
    }
  });

  it('R2: the moving share of a day is between 0.10 and 0.60', async () => {
    const { rows } = await recordedDay();
    for (const [id, list] of rows) {
      const live = list.filter((s) => !s.exempt);
      const share = live.filter((s) => s.moved).length / live.length;
      expect(share, id).toBeGreaterThanOrEqual(0.1);
      expect(share, id).toBeLessThanOrEqual(0.6);
    }
  });

  it('R3: no NPC walks more than maxWalkS since its last still run', async () => {
    const { rows } = await recordedDay();
    const cap = balance.npc.routine.maxWalkS * TICK_RATE + 10;
    for (const [id, list] of rows) {
      let walked = 0;
      let still = 0;
      for (const s of list) {
        if (s.exempt) continue;
        if (s.moved) {
          walked++;
          still = 0;
        } else if (++still >= idleMin()) walked = 0;
        expect(walked, `${id}@${s.tick}`).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('R4: a scene is left only after its dwell, and most NPCs move on', async () => {
    const { rows } = await recordedDay();
    const min = Math.round(balance.npc.routine.sceneDwellS.min * TICK_RATE);
    let changed = 0;
    for (const [id, list] of rows) {
      let entered = list[0]!.tick;
      let changes = 0;
      for (let i = 1; i < list.length; i++) {
        const s = list[i]!;
        if (s.scene !== list[i - 1]!.scene) {
          if (s.mode !== 'fallback') expect(s.tick - entered, `${id}@${s.tick}`).toBeGreaterThanOrEqual(min);
          entered = s.tick;
          changes++;
        }
      }
      if (changes > 0) changed++;
    }
    expect(changed).toBeGreaterThanOrEqual(6);
  });

  it('R5 and R6: visits last stationDwellS, at a day station, facing it, one NPC per station', async () => {
    const { party, rows } = await recordedDay();
    const sim = simOf(party.room);
    const map = mapScenesOf(party.room);
    const byId = new Map(stationsOf(map, sim.profile).map((s) => [s.propId, s]));
    const d = balance.npc.routine.stationDwellS;
    const atTick = new Map<number, Set<string>>();
    for (const [id, list] of rows) {
      let visits = 0;
      for (let i = 0; i < list.length; i++) {
        const s = list[i]!;
        if (s.act !== 'work') continue;
        const st = byId.get(s.station)!;
        const seen = atTick.get(s.tick) ?? new Set<string>();
        expect(seen.has(s.station), `two NPCs at ${s.station} on ${s.tick}`).toBe(false);
        seen.add(s.station);
        atTick.set(s.tick, seen);
        if (list[i - 1]?.act === 'work' && list[i - 1]?.station === s.station) continue;
        // The first tick of a visit.
        let len = 0;
        while (list[i + len]?.act === 'work' && list[i + len]?.station === s.station) len++;
        if (i + len === list.length) continue; // cut by the end of the recording
        visits++;
        expect(len, `${id} ${s.station}@${s.tick}`).toBeGreaterThanOrEqual(d.min * TICK_RATE - 1);
        expect(len, `${id} ${s.station}@${s.tick}`).toBeLessThanOrEqual(d.max * TICK_RATE + 1);
        expect(routines.activities[st.activity]!.phases).toContain('day');
        const tx = Math.floor(s.x / TILE_PX);
        const ty = Math.floor(s.y / TILE_PX);
        expect(Math.abs(tx - st.x) + Math.abs(ty - st.y), `${id} stands next to ${s.station}`).toBe(1);
        const cx = (st.x + 0.5) * TILE_PX - s.x;
        const cy = (st.y + 0.5) * TILE_PX - s.y;
        const dot = (Math.sin(s.yaw) * cx + -Math.cos(s.yaw) * cy) / Math.hypot(cx, cy);
        expect(Math.acos(Math.min(1, dot)), `${id} faces ${s.station}`).toBeLessThanOrEqual(
          Math.PI / 4 + 1e-6,
        );
        for (let j = 1; j < len; j++) expect(list[i + j]!.yaw, `${id} turns at ${s.station}`).toBe(s.yaw);
      }
      expect(visits, id).toBeGreaterThanOrEqual(2);
    }
  });

  it('R7: every NPC has a persona: a lit home of its own and three favourites in three scenes', async () => {
    const party = await standardParty(colyseus, 'S1', true);
    advance(party, 3);
    const mem = npcMemory(party.room);
    const map = mapScenesOf(party.room);
    const stations = new Map(stationsOf(map, profileFor(10)).map((s) => [s.propId, s]));
    const homes = new Set<SceneId>();
    for (const id of npcIdsOf('S1')) {
      const persona = mem.brain(id).persona!;
      expect(persona, id).not.toBeNull();
      const home = persona.home!;
      expect(scenes[home].kind).toBe('interior');
      expect(isLitAtNight(scenes[home])).toBe(true);
      expect(map).toContain(home);
      homes.add(home);
      expect(persona.favourites).toHaveLength(balance.npc.routine.favouriteStations);
      const where = persona.favourites.map((f) => stations.get(f)!.scene);
      expect(new Set(where).size).toBe(where.length);
    }
    expect(homes.size).toBe(9);
    void sceneKey;
  });
});

// --- the night, reactions, clues, stuck goals, the hunt, the fallback and the streams (PR 3) ----------------

const patch = <T extends object, K extends keyof T>(obj: T, key: K, value: T[K]): (() => void) => {
  const saved = obj[key];
  obj[key] = value;
  return () => {
    obj[key] = saved;
  };
};
const RUN = openRun('overworld', 8);
const asClient = (id: string) => ({ sessionId: id }) as Client;

/** Everyone but `keep` becomes a ghost, so the scenario has the seats it names and no more. */
function onlyAlive(party: Party, keep: readonly string[]): void {
  for (const [id, p] of simOf(party.room).players) p.dead = !keep.includes(id);
}

/** Parks every NPC (and the human) of `ids` far from a scenario so it never joins it. */
function watchRequests(party: Party): MeetingRequest[] {
  const seen: MeetingRequest[] = [];
  const sim = simOf(party.room);
  const push = sim.meetingRequests.push.bind(sim.meetingRequests);
  sim.meetingRequests.push = (...items: MeetingRequest[]) => {
    seen.push(...items);
    return push(...items);
  };
  return seen;
}

describe('lit at night (R8)', () => {
  const tavern = scenes.tavern_bar;
  const square = scenes.overworld;
  const noLights = {
    ...square,
    lights: undefined,
    props: square.props.filter((q) => q.kind !== 'lanternPost'),
  };
  const light = (phases?: ('day' | 'dusk' | 'night')[]) => ({
    id: 'xx.l',
    kind: 'lantern' as const,
    x: 1,
    y: 1,
    radiusTiles: 3,
    ...(phases && { phases }),
  });

  it('an interior is lit unless dark or a cave', () => {
    expect(isLitAtNight({ ...tavern, dark: undefined, biome: undefined } as Scene)).toBe(true);
    expect(isLitAtNight({ ...tavern, dark: true } as Scene)).toBe(false);
    expect(isLitAtNight({ ...tavern, biome: 'cave' } as Scene)).toBe(false);
  });

  it('an exterior is lit by a lantern post or a light that burns at night', () => {
    expect(isLitAtNight(noLights as Scene)).toBe(false);
    expect(isLitAtNight(square)).toBe(true);
    expect(isLitAtNight({ ...noLights, lights: [light()] } as Scene)).toBe(true);
    expect(isLitAtNight({ ...noLights, lights: [light(['dusk', 'night'])] } as Scene)).toBe(true);
    expect(isLitAtNight({ ...noLights, lights: [light(['day'])] } as Scene)).toBe(false);
    expect(isLitAtNight({ ...noLights, biome: 'forest', lights: [light()] } as Scene)).toBe(false);
  });

  it('the shipped scenes: eleven lit, four not', () => {
    const lit = [
      'overworld',
      'tavern_bar',
      'tavern_back',
      'apoth_shop',
      'widow_parlour',
      'widow_bedroom',
      'bakery',
      'manor_hall',
      'manor_upper',
      'barn',
      'chapel',
    ];
    const unlit = ['apoth_loft', 'forest', 'cave_entry', 'cellar'];
    for (const id of lit) expect(litAtNight(id as SceneId), id).toBe(true);
    for (const id of unlit) expect(litAtNight(id as SceneId), id).toBe(false);
  });
});

describe('the privacy rule, plumbing (P1b, P4)', () => {
  it.skipIf(Object.keys(routines.holds).length === 0)(
    'P1b: a human can start every hold the routines table names',
    async () => {
      const party = await standardParty(colyseus, 'S1');
      const human = party.humans[0]!.id;
      for (const [kind, action] of Object.entries(routines.holds)) {
        const st = stationsOf(mapScenesOf(party.room), simOf(party.room).profile).find(
          (s) => s.kind === kind,
        )!;
        const at = st.stands[0]!;
        placeSeat(party, human, st.scene, at.x, at.y);
        holdPhase(party, Phase.day, 600);
        party.room.commands.push(asClient(human), 'act.hold', { action, targetId: st.propId, on: true });
        advance(party, 2);
        expect(simOf(party.room).players.get(human)!.hold, kind).not.toBeNull();
      }
    },
  );

  it('P4: with a patched hold row the visit tries exactly once, is refused, and never animates', async () => {
    const restore = [
      patch(routines.holds as Record<string, 'task'>, 'pump', 'task'),
      patch(balance.npc.routine.weights, 'day', { work: 1, stroll: 0, idle: 0 }),
    ];
    try {
      const party = await standardParty(colyseus, 'S1');
      allTownsfolk(party.room);
      const [id] = npcIdsOf('S1') as [string];
      onlyAlive(party, [id, party.humans[0]!.id]);
      placeSeat(party, id, 'overworld', RUN.x, RUN.y);
      holdPhase(party, Phase.day, 3600);
      const brain = npcMemory(party.room).brain(id);
      brain.persona = { home: 'tavern_bar', favourites: ['ov.pump'] };
      const rows = record(party, [id], 1500).get(id)!;
      const visit = rows.filter((s) => s.act === 'work' && s.station === 'ov.pump');
      expect(visit.length).toBeGreaterThan(200);
      // The arrival tick shows the last step toward the prop; no tick of the visit is `interact`.
      expect(visit.every((s) => s.hold === null && s.anim !== 4)).toBe(true);
      expect(visit.slice(1).every((s) => s.anim === 0)).toBe(true);
      expect(Math.max(...visit.map((s) => s.holdTries))).toBe(1);
    } finally {
      restore.forEach((r) => r());
    }
  });
});

describe('the night (R9, R10)', () => {
  /** Forest floor tiles at least 20 tiles from the gate. */
  function farForest(count: number): { x: number; y: number }[] {
    const grid = new NavGrid(navs.forest, 'large');
    const gate = scenes.forest.portals.find((q) => q.id === 'fo.gate')!;
    const out: { x: number; y: number }[] = [];
    for (let y = 0; y < grid.h && out.length < count * 4; y++)
      for (let x = 0; x < grid.w; x++)
        if (!grid.solidAt(x, y) && Math.hypot(x - gate.x, y - gate.y) >= 20 && (x + y) % 7 === 0)
          out.push({ x, y });
    return out.slice(0, count);
  }

  it('R9: NPCs in the forest wait a seeded delay, then walk out to a lit scene with their usual pauses', async () => {
    const party = await standardParty(colyseus, 'S1');
    allTownsfolk(party.room);
    const mem = npcMemory(party.room);
    const ids = npcIdsOf('S1').slice(0, 3);
    const tiles = farForest(3);
    ids.forEach((id, i) => placeSeat(party, id, 'forest', tiles[i]!.x, tiles[i]!.y));
    advance(party, 2);
    holdPhase(party, Phase.dusk, balance.phases.duskS);
    const start = party.room.state.tick;
    const leave = new Map<string, number>();
    const litAt = new Map<string, number>();
    const d = balance.npc.night.leaveDelayS;
    const rows = record(party, ids, (balance.phases.duskS + balance.phases.nightS) * TICK_RATE - 5, () => {
      for (const id of ids) {
        const b = mem.brain(id);
        if (b.leaveAtTick >= 0 && !leave.has(id)) leave.set(id, b.leaveAtTick);
      }
    });
    for (const id of ids) {
      const list = rows.get(id)!;
      const at = leave.get(id)!;
      expect(at, id).toBeGreaterThanOrEqual(start + d.min * TICK_RATE);
      expect(at, id).toBeLessThanOrEqual(start + d.max * TICK_RATE + 2);
      let walked = 0;
      let still = 0;
      for (const [i, s] of list.entries()) {
        const here = sceneKey(s.scene);
        if (s.tick < at) {
          expect(s.mode, id).not.toBe('home');
          expect(here, `${id} crossed before it left`).toBe('forest');
        }
        if (!litAt.has(id) && litAtNight(here)) litAt.set(id, s.tick);
        if (litAt.has(id)) expect(litAtNight(here), `${id} in the dark at ${s.tick}`).toBe(true);
        if (s.act === 'work') {
          const st = stationsOf(mapScenesOf(party.room), simOf(party.room).profile).find(
            (x) => x.propId === s.station,
          )!;
          expect(routines.activities[st.activity]!.phases).toContain('night');
        }
        if (s.mode === 'home') {
          if (s.moved) walked++;
          else if (++still >= 40) walked = 0;
          if (s.moved) still = 0;
          expect(walked, `${id}@${s.tick}`).toBeLessThanOrEqual(
            balance.npc.routine.maxWalkS * TICK_RATE + 10,
          );
        }
        void i;
      }
      expect(litAt.get(id)! - start, id).toBeLessThanOrEqual((d.max + 45) * TICK_RATE);
    }
    expect(new Set(leave.values()).size).toBeGreaterThan(1);
  });

  it('R10: the night is calmer than the day', async () => {
    const party = await standardParty(colyseus, 'S1');
    allTownsfolk(party.room);
    const ids = npcIdsOf('S1');
    holdPhase(party, Phase.day, 300);
    advance(party, 300 * TICK_RATE);
    for (let cycle = 0; cycle < 2; cycle++) {
      holdPhase(party, Phase.dusk, balance.phases.duskS);
      const rows = record(party, ids, (balance.phases.duskS + balance.phases.nightS) * TICK_RATE - 5);
      const shares = ids.map((id) => {
        const live = rows.get(id)!.filter((s) => !s.exempt);
        return live.filter((s) => s.moved).length / live.length;
      });
      expect(shares.reduce((a, b) => a + b, 0) / shares.length).toBeLessThanOrEqual(0.45);
      holdPhase(party, Phase.day, 120);
      advance(party, 60 * TICK_RATE);
    }
  });
});

describe('reactions (R11, R12)', () => {
  /** One NPC `a` in the overworld, a body of `b` three tiles away, by day, nobody else alive but the human. */
  async function scene(killer: boolean) {
    const party = await standardParty(colyseus, 'S1');
    allTownsfolk(party.room);
    const [a, b] = npcIdsOf('S1') as [string, string];
    if (killer) setRole(party.room, a, 'killer');
    onlyAlive(party, [a, party.humans[0]!.id]);
    holdPhase(party, Phase.day, 3600);
    placeSeat(party, a, 'overworld', RUN.x, RUN.y);
    advance(party, 3);
    return { party, a, b, requests: watchRequests(party) };
  }

  for (const killer of [false, true]) {
    it(`R11: ${killer ? 'a Killer NPC' : 'an NPC'} freezes at a body it did not make, walks to it and reports it`, async () => {
      const { party, a, b, requests } = await scene(killer);
      const p = simOf(party.room).players.get(a)!;
      const from = { x: p.x, y: p.y };
      spawnBody(party.room, 'overworld', b, RUN.x + 3, RUN.y);
      const s = balance.npc.react.startleS;
      const moves: number[] = [];
      let reachedAt = -1;
      const brain = npcMemory(party.room).brain(a);
      advance(party, 20 * 12, (tick) => {
        if (p.x !== from.x || p.y !== from.y) moves.push(tick);
        if (reachedAt < 0 && brain.reachedBodyTick.has(`body_${b}`))
          reachedAt = brain.reachedBodyTick.get(`body_${b}`)!;
      });
      const first = party.room.state.tick - 20 * 12;
      expect(moves[0]! - first).toBeGreaterThanOrEqual(s.min * TICK_RATE);
      expect(moves[0]! - first).toBeLessThanOrEqual(s.max * TICK_RATE + 2);
      expect(requests[0]).toMatchObject({ reason: 'body', callerId: a, bodyOf: b });
      expect(reachedAt).toBeGreaterThan(0);
    });
  }

  it('R11: a Killer NPC beside the body of its own strike never startles and never reports it', async () => {
    const { party, a, b, requests } = await scene(true);
    const brain = npcMemory(party.room).brain(a);
    spawnBody(party.room, 'overworld', b, RUN.x + 2, RUN.y);
    brain.ownBodies.add(`body_${b}`);
    brain.seenBodies.add(`body_${b}`);
    advance(party, 20 * 12, () => {
      expect(brain.startleUntilTick).toBe(-1);
      expect(brain.mode).toBe('routine');
    });
    expect(requests).toHaveLength(0);
  });

  /** Opens a bell meeting and runs it to immunity; returns the tick the phase began. */
  function toImmunity(party: Party): number {
    simOf(party.room).meetingRequests.push({ reason: 'bell', callerId: party.humans[0]!.id });
    while (party.room.state.phase !== Phase.immunity) advance(party, 1);
    return party.room.state.tick;
  }

  /** The placement idle holds: nobody moves for a while, then every routine runs. */
  function checkPlacement(party: Party, ids: readonly string[], placedAt: number): void {
    const a = balance.npc.react.afterPlacementIdleS;
    const mem = npcMemory(party.room);
    const sim = simOf(party.room);
    const first = new Map<string, number>();
    const start = new Map(ids.map((id) => [id, { x: sim.players.get(id)!.x, y: sim.players.get(id)!.y }]));
    advance(party, a.max * TICK_RATE + 20, (tick) => {
      for (const id of ids) {
        const p = sim.players.get(id)!;
        const s = start.get(id)!;
        if (!first.has(id) && (p.x !== s.x || p.y !== s.y)) first.set(id, tick);
        if (tick - placedAt === a.max * TICK_RATE + 2) {
          expect(mem.brain(id).mode, id).toBe('routine');
          expect(mem.brain(id).act !== null || tick < mem.brain(id).pauseUntilTick, id).toBe(true);
        }
      }
    });
    for (const id of ids) {
      if (first.has(id)) expect(first.get(id)! - placedAt, id).toBeGreaterThanOrEqual(a.min * TICK_RATE - 1);
      expect(mem.brain(id).sceneEnteredTick - placedAt, id).toBeLessThanOrEqual(1);
    }
  }

  it('R12: after the immunity placement every NPC stands 3-8 s before its routine resumes', async () => {
    const party = await standardParty(colyseus, 'S1');
    allTownsfolk(party.room);
    holdPhase(party, Phase.day, 3600);
    advance(party, 5);
    const placedAt = toImmunity(party);
    checkPlacement(party, npcIdsOf('S1'), placedAt);
  });

  it('R12: and after the grace placement', async () => {
    const party = await standardParty(colyseus, 'S1', true);
    allTownsfolk(party.room);
    while (party.room.state.phase !== Phase.grace) advance(party, 1);
    advance(party, 1);
    const placedAt = party.room.state.tick;
    checkPlacement(party, npcIdsOf('S1'), placedAt);
  });
});

describe('clues and stuck goals (R13, R14)', () => {
  async function clueScene(chance: number) {
    const restore = patch(balance.npc.react, 'collectChance', chance);
    const party = await standardParty(colyseus, 'S1');
    allTownsfolk(party.room);
    const [a] = npcIdsOf('S1') as [string];
    onlyAlive(party, [a, party.humans[0]!.id]);
    holdPhase(party, Phase.day, 3600);
    removeClue(party.room, 'clue_teaching');
    placeSeat(party, a, 'overworld', RUN.x, RUN.y);
    advance(party, 3);
    const brain = npcMemory(party.room).brain(a);
    brain.placementIdleUntilTick = -1;
    brain.pendingClue = '';
    return { party, a, restore };
  }
  const footprint = (party: Party) =>
    spawnClue(party.room, 'overworld', {
      kind: ClueKind.footprints,
      value: 0,
      dir: 0,
      tx: RUN.x + 3,
      ty: RUN.y,
      decayS: null,
    }) as string;
  /** Ends the NPC's current activity so its next choice comes on the next tick. */
  const endNow = (party: Party, a: string) => {
    const b = npcMemory(party.room).brain(a);
    b.act = { kind: 'idle', untilTick: party.room.state.tick + 1, stationId: '', goal: null };
    b.pauseUntilTick = -1;
  };

  it('R13: with chance 1 an NPC collects a clue it sees through the human verb', async () => {
    const { party, a, restore } = await clueScene(1);
    try {
      const clue = footprint(party);
      endNow(party, a);
      const p = simOf(party.room).players.get(a)!;
      let held = -1;
      const rows = record(party, [a], 100, () => {
        if (held < 0 && p.hold) held = party.room.state.tick;
      }).get(a)!;
      expect(held).toBeGreaterThan(0);
      for (const [i, s] of rows.entries()) {
        if (s.hold) expect(s.hold).toEqual({ action: 'collect', targetId: clue });
        if (s.hold && rows[i - 1]?.hold) expect(s.anim).toBe(4);
      }
      expect(simOf(party.room).clueMeta.get(clue)!.collectors.has(a)).toBe(true);
      const entries = party.room.state.players.get(a)!.priv.notebook;
      expect(entries.length).toBe(1);
      expect(entries[0]!.clueKind).toBe(ClueKind.footprints);
    } finally {
      restore();
    }
  });

  it('R13: with chance 0 no NPC holds anything, and none during immunity', async () => {
    const zero = await clueScene(0);
    try {
      footprint(zero.party);
      const rows = record(zero.party, npcIdsOf('S1'), 60 * TICK_RATE);
      for (const list of rows.values()) expect(list.every((s) => s.hold === null)).toBe(true);
    } finally {
      zero.restore();
    }
    await colyseus.cleanup();
    const one = await clueScene(1);
    try {
      footprint(one.party);
      holdPhase(one.party, Phase.immunity, 30);
      const rows = record(one.party, [one.a], 20 * TICK_RATE);
      expect(rows.get(one.a)!.every((s) => s.hold === null)).toBe(true);
    } finally {
      one.restore();
    }
  });

  it('R13: a pending clue of a scene the NPC has left is dropped', async () => {
    const { party, a, restore } = await clueScene(1);
    try {
      const brain = npcMemory(party.room).brain(a);
      brain.act = { kind: 'idle', untilTick: party.room.state.tick + 1000, stationId: '', goal: null };
      const clue = footprint(party);
      advance(party, 2);
      expect(brain.pendingClue).toBe(clue);
      placeSeat(party, a, 'tavern_bar', ...(Object.values(openRun('tavern_bar', 1)) as [number, number]));
      endNow(party, a);
      const rows = record(party, [a], 100).get(a)!;
      expect(rows.every((s) => s.hold === null)).toBe(true);
      expect(brain.pendingClue).toBe('');
    } finally {
      restore();
    }
  });

  it('R14: a goal it cannot approach is dropped after stuckS and never picked straight again', async () => {
    const { party, a, restore } = await clueScene(0);
    const unpatch = patch(balance.movement, 'walkTilesPerS', 0);
    try {
      const brain = npcMemory(party.room).brain(a);
      brain.act = { kind: 'travel', untilTick: Infinity, stationId: 'ov.pump', goal: null };
      npcMemory(party.room).claims.set('ov.pump', a);
      brain.pauseUntilTick = -1;
      brain.placementIdleUntilTick = -1;
      const began = party.room.state.tick;
      let droppedAt = -1;
      advance(party, 60, (tick) => {
        if (droppedAt < 0 && brain.act?.kind !== 'travel') droppedAt = tick;
      });
      expect(droppedAt - began).toBeLessThanOrEqual(balance.npc.routine.stuckS * TICK_RATE + 2);
      expect(brain.lastStationId).toBe('ov.pump');
    } finally {
      unpatch();
      restore();
    }
  });

  it('R14: a goal tile with no path is dropped on the tick it is set', async () => {
    const { party, a, restore } = await clueScene(0);
    try {
      const grid = new NavGrid(navs.overworld, simOf(party.room).profile);
      let tile: { x: number; y: number } | null = null;
      for (let y = 1; y < grid.h - 1 && !tile; y++)
        for (let x = 1; x < grid.w - 1 && !tile; x++)
          if (
            grid.solidAt(x, y) &&
            grid.solidAt(x + 1, y) &&
            grid.solidAt(x - 1, y) &&
            grid.solidAt(x, y + 1) &&
            grid.solidAt(x, y - 1)
          )
            tile = { x, y };
      const brain = npcMemory(party.room).brain(a);
      brain.act = {
        kind: 'stroll',
        untilTick: Infinity,
        stationId: '',
        goal: { scene: sceneIndex('overworld'), x: (tile!.x + 0.5) * TILE_PX, y: (tile!.y + 0.5) * TILE_PX },
      };
      brain.pauseUntilTick = -1;
      advance(party, 1);
      expect(brain.act?.kind).not.toBe('stroll');
    } finally {
      restore();
    }
  });
});

describe('the hunt, the fallback and the streams (R15 to R18)', () => {
  it('R15: a Killer NPC whose dwell has run goes for the station of the scene where a lone human stands', async () => {
    const restore = patch(balance.npc.routine.weights, 'night', { work: 1, stroll: 0, idle: 0 });
    try {
      const party = await standardParty(colyseus, 'S1');
      allTownsfolk(party.room);
      const ids = npcIdsOf('S1');
      const [k, ...rest] = ids as [string, ...string[]];
      const human = party.humans[0]!.id;
      setRole(party.room, k, 'killer');
      party.room.state.players.get(k)!.priv.cooldownEndTick.set('kill', 1e9);
      placeSeat(party, human, 'apoth_shop', ...(Object.values(openRun('apoth_shop', 1)) as [number, number]));
      rest.forEach((id, i) => placeSeat(party, id, 'overworld', RUN.x + (i % 8), RUN.y));
      placeSeat(party, k, 'tavern_bar', ...(Object.values(openRun('tavern_bar', 1)) as [number, number]));
      holdPhase(party, Phase.night, 600);
      advance(party, 2);
      const brain = npcMemory(party.room).brain(k);
      brain.sceneDwellUntilTick = party.room.state.tick;
      brain.act = null;
      brain.pauseUntilTick = -1;
      brain.placementIdleUntilTick = -1;
      advance(party, 2);
      const act = brain.act as Act | null;
      expect(act?.kind).toBe('travel');
      const st = stationsOf(mapScenesOf(party.room), simOf(party.room).profile).find(
        (s) => s.propId === act!.stationId,
      )!;
      expect(st.scene).toBe('apoth_shop');
    } finally {
      restore();
    }
  });

  it('R16: with routines off every NPC wanders in fallback mode, and on again they return within 2 ticks', async () => {
    const party = await standardParty(colyseus, 'S1');
    allTownsfolk(party.room);
    const ids = npcIdsOf('S1');
    holdPhase(party, Phase.day, 600);
    party.room.commands.push(asClient(party.humans[0]!.id), 'debug.npc', {});
    const mem = npcMemory(party.room);
    mem.debug.push({ routine: false });
    const rows = record(party, ids, 30 * TICK_RATE);
    for (const id of ids) expect(mem.brain(id).mode, id).toBe('fallback');
    const busy = ids.filter((id) => {
      const list = rows.get(id)!.filter((s) => !s.busy);
      return list.filter((s) => s.moved).length / list.length > 0.6;
    });
    expect(busy.length).toBeGreaterThanOrEqual(2);
    mem.debug.push({ routine: true });
    advance(party, 2);
    for (const id of ids) expect(mem.brain(id).mode, id).toBe('routine');
  });

  it('R17: no NPC draw touches the deal, and every NPC stream is keyed', async () => {
    const party = await standardParty(colyseus, 'S1', true);
    const seeds = party.room.seeds;
    const get = seeds.get.bind(seeds);
    const asked: string[] = [];
    seeds.get = ((name: Parameters<typeof get>[0], key?: string) => {
      asked.push(`${name}:${key ?? ''}`);
      return get(name, key);
    }) as typeof seeds.get;
    advance(party, 5 * TICK_RATE);
    allTownsfolk(party.room);
    holdPhase(party, Phase.day, 700);
    advance(party, 600 * TICK_RATE);
    const ids = new Set(npcIdsOf('S1'));
    expect(asked.some((k) => k.startsWith('deal'))).toBe(false);
    for (const k of new Set(asked)) {
      const [name, key] = k.split(':');
      if (name === 'npcPlay' || name === 'npcTiming') expect(ids.has(key!), k).toBe(true);
      else expect(['npcNames', 'nodes'], k).toContain(name); // round 6, 6F: the node pool's own stream
    }
  });

  it('R18: a Killer and a Townsfolk NPC draw the same numbers and walk the same path while the Knife rests', async () => {
    const runs: { from: number; play: number; timing: number; path: string }[] = [];
    for (const killer of [true, false]) {
      await colyseus.cleanup();
      const party = await standardParty(colyseus, 'S1');
      allTownsfolk(party.room);
      const ids = npcIdsOf('S1');
      const [k, ...rest] = ids as [string, ...string[]];
      const human = party.humans[0]!.id;
      if (killer) {
        setRole(party.room, k, 'killer');
        party.room.state.players.get(k)!.priv.cooldownEndTick.set('kill', 1e9);
      }
      const at = openRun('tavern_bar', 2);
      placeSeat(party, human, 'tavern_bar', at.x, at.y);
      placeSeat(party, k, 'tavern_bar', at.x + 1, at.y);
      rest.forEach((id, i) => placeSeat(party, id, 'overworld', RUN.x + (i % 8), RUN.y));
      holdPhase(party, Phase.night, 90);
      advance(party, 2);
      for (const id of ids)
        npcMemory(party.room).brain(id).sceneDwellUntilTick = party.room.state.tick + 12000;
      const counts = new Map<string, number>();
      const seeds = party.room.seeds;
      const get = seeds.get.bind(seeds);
      seeds.get = ((name: Parameters<typeof get>[0], key?: string) => {
        const rng = get(name, key);
        const label = `${name}:${key ?? ''}`;
        return () => {
          counts.set(label, (counts.get(label) ?? 0) + 1);
          return rng();
        };
      }) as typeof seeds.get;
      // The tick the recording starts on: `standardParty` gives both parties one timeline, whatever the load.
      const from = party.room.state.tick;
      const rows = record(party, [k], 60 * TICK_RATE).get(k)!;
      runs.push({
        from,
        play: counts.get(`npcPlay:${k}`) ?? 0,
        timing: counts.get(`npcTiming:${k}`) ?? 0,
        path: rows.map((s) => `${s.x},${s.y}`).join(';'),
      });
    }
    expect(runs[0]).toEqual(runs[1]);
    expect(runs[0]!.play).toBeGreaterThanOrEqual(60 * TICK_RATE);
  });
});
