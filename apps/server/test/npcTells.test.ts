import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { Phase, TICK_RATE } from '@wdi/shared';
import { spawnBody } from '../src/sim/Bodies';
import { npcMemory } from '../src/sim/npc/memory';
import { simOf } from '../src/sim/RoomSim';
import { sceneIndex } from '../src/sim/World';
import { endMatch } from '../src/sim/Win';
import { openRun } from './killHelpers';
import { type Party, bootNpcServer, npcIdsOf, standardParty, type SeedSet } from './npcHelpers';
import { type Recording, type SeatSample, type TickSample, findTells, recordMatch } from './npcTells';

// No NPC tell in a recorded match (GDD 3.12; npc.md part 2, section 7).

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const RUN = openRun('overworld', 8);
const slow = process.env.WDI_SLOW === '1';
const sets: SeedSet[] = slow ? ['S1', 'S2', 'S3', 'S4'] : ['S1'];

/**
 * The scenario around a recorded match: a body found by day in round 2 and a bell meeting in round 3, so the
 * reactions, the report, the votes and the placements all happen. The Final Night (5G) ends a match by itself once
 * it lands; until then the match is ended white-box when round 5 would begin.
 */
function scenario(party: Party, set: SeedSet): (tick: number) => void {
  const room = party.room;
  const sim = simOf(room);
  const victim = npcIdsOf(set)[8]!;
  let bodied = false;
  let belled = false;
  return () => {
    const { phase, round } = room.state;
    if (round === 2 && phase === Phase.day && !bodied && room.state.phaseEndsTick - room.state.tick < 900) {
      bodied = true;
      sim.players.get(victim)!.dead = true;
      spawnBody(room, 'overworld', victim, RUN.x + 2, RUN.y);
    }
    if (round === 3 && phase === Phase.day && !belled && room.state.phaseEndsTick - room.state.tick < 900) {
      belled = true;
      sim.meetingRequests.push({ reason: 'bell', callerId: party.humans[0]!.id });
    }
    if (round >= 5 && phase !== Phase.gameOver && phase !== Phase.lobby && room.state.winner === 0)
      endMatch(room, 'village');
  };
}

describe('E1: a recorded match shows no NPC tell', () => {
  for (const set of sets) {
    it(`seed set ${set}`, async () => {
      const party = await standardParty(colyseus, set, true);
      const rec = recordMatch(party, { maxTicks: 45_000, lobbyExtraS: 12, onTick: scenario(party, set) });
      const tells = findTells(rec);
      expect(tells.map((t) => `${set} ${t.code} ${t.seat}@${t.tick}: ${t.detail}`)).toEqual([]);
    }, 120_000);
  }
});

describe('E2: the detector catches the old brain', () => {
  it('flags the M3c wander on at least three of nine NPCs', async () => {
    const party = await standardParty(colyseus, 'S1', true);
    npcMemory(party.room).debug.push({ routine: false });
    const rec = recordMatch(party, { maxTicks: 45_000, lobbyExtraS: 12, onTick: scenario(party, 'S1') });
    const flagged = new Set(
      findTells(rec)
        .filter((t) => t.code === 'T2' || t.code === 'T3')
        .map((t) => t.seat),
    );
    expect(flagged.size).toBeGreaterThanOrEqual(3);
  }, 120_000);
});

// --- E3: the detector, pure, on synthetic recordings ---------------------------------------------------------

const NPCS = ['n1', 'n2', 'n3'];

/** A recording of `ticks` ticks in `phase`, every seat standing in scene 0, edited tick by tick by `edit`. */
function synth(
  ticks: number,
  phase: number,
  edit: (tick: number, seats: Map<string, SeatSample>, t: TickSample) => void = () => undefined,
  ids: readonly string[] = NPCS,
  first = 1000,
): Recording {
  const out: TickSample[] = [];
  for (let i = 0; i < ticks; i++) {
    const seats = new Map<string, SeatSample>();
    for (const id of ids) {
      seats.set(id, {
        scene: 0,
        x: 100,
        y: 100,
        yaw: 0,
        animId: 0,
        hold: null,
        dead: false,
        placed: true,
        busy: false,
        mode: 'routine',
        ready: false,
        voted: false,
      });
    }
    const t: TickSample = { tick: first + i, phase, phaseEndsTick: first + ticks, seats, bodies: [] };
    edit(first + i, seats, t);
    out.push(t);
  }
  return { ticks: out, npcIds: new Set(ids), cardReadyTicks: new Map(), cardOpenTick: first };
}

const codes = (rec: Recording) => [...new Set(findTells(rec).map((t) => t.code))];

describe('E3: the detector, pure', () => {
  it('a clean synthetic day yields nothing', () => {
    // 15 % of the time walking in 100-tick rounds, the rest standing.
    const rec = synth(1500, Phase.day, (tick, seats) => {
      for (const [i, s] of [...seats.values()].entries()) {
        const k = (tick + i * 37) % 300;
        if (k < 60) s.x = 100 + k * 3;
        else s.x = 100 + 59 * 3;
        s.animId = k < 60 ? 1 : 0;
      }
    });
    expect(findTells(rec)).toEqual([]);
  });

  it('a vote 100 ticks after the discussion opened is T8', () => {
    const rec = synth(400, Phase.meetingDiscussion, (tick, seats, t) => {
      t.phaseEndsTick = 1000 + 1500;
      if (tick >= 1100) seats.get('n1')!.voted = true;
    });
    expect(codes(rec)).toContain('T8');
  });

  it('every NPC ready on the reset tick is T9', () => {
    const rec = synth(300, Phase.lobby, (_, seats) => {
      for (const s of seats.values()) s.ready = true;
    });
    // The lobby is entered from a world phase.
    rec.ticks.unshift({
      ...rec.ticks[0]!,
      tick: 999,
      phase: Phase.gameOver,
      seats: new Map(rec.ticks[0]!.seats),
    });
    expect(codes(rec)).toContain('T9');
  });

  it('three ticks of walking in place are T1', () => {
    const rec = synth(10, Phase.day, (tick, seats) => {
      if (tick >= 1003 && tick < 1006) seats.get('n1')!.animId = 1;
    });
    expect(codes(rec)).toContain('T1');
  });

  it('interact without a hold is T4', () => {
    const rec = synth(10, Phase.day, (tick, seats) => {
      if (tick >= 1003) seats.get('n1')!.animId = 4;
    });
    expect(codes(rec)).toContain('T4');
  });

  it('a crossing 300 ticks after entering is T6', () => {
    const rec = synth(500, Phase.day, (tick, seats) => {
      if (tick >= 1300) seats.get('n1')!.scene = 1;
    });
    expect(codes(rec)).toContain('T6');
  });

  it('a crossing on the tick the brain turns home is not T6', () => {
    const rec = synth(500, Phase.day, (tick, seats) => {
      if (tick >= 1300) Object.assign(seats.get('n1')!, { scene: 1, mode: 'home' });
    });
    expect(codes(rec).includes('T6')).toBe(false);
  });

  it('standing 40 ticks beside a body it did not make is T11, beside its own it is not', () => {
    const body = (by: string) => (_: number, __: Map<string, SeatSample>, t: TickSample) => {
      t.bodies = [{ id: 'body_x', scene: 0, x: 100 + 3 * 64, y: 100, by, open: true }];
    };
    expect(codes(synth(60, Phase.day, body('someone')))).toContain('T11');
    expect(codes(synth(60, Phase.day, body('n1'))).includes('T11')).toBe(true); // still ignored by n2 and n3
    expect(findTells(synth(60, Phase.day, body('n1'), ['n1'])).filter((t) => t.code === 'T11')).toEqual([]);
  });

  it('three NPCs still in the forest at dusk that first move 10 ticks apart are T12', () => {
    const rec = synth(120, Phase.dusk, (tick, seats) => {
      for (const [i, id] of NPCS.entries()) {
        const s = seats.get(id)!;
        s.scene = sceneIndex('forest');
        if (tick >= 1030 + i * 10) s.x = 100 + (tick - 1030 - i * 10) * 5;
      }
    });
    rec.ticks.unshift({ ...rec.ticks[0]!, tick: 999, phase: Phase.day, seats: new Map(rec.ticks[0]!.seats) });
    expect(codes(rec)).toContain('T12');
  });

  void TICK_RATE;
});
