import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, profileFor, routines, scenes, type SceneId } from '@wdi/content';
import { Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import { npcMemory } from '../src/sim/npc/memory';
import { stationsOf, isLitAtNight } from '../src/sim/npc/routine';
import { mapScenesOf } from '../src/sim/MapSites';
import { simOf } from '../src/sim/RoomSim';
import { sceneKey } from '../src/sim/World';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  npcIdsOf,
  standardParty,
} from './npcHelpers';

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
