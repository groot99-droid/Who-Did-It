import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from '@colyseus/core';
import type { ColyseusTestServer } from '@colyseus/testing';
import { abilities, navs } from '@wdi/content';
import { ClueKind, NavGrid, Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import { spawnClue } from '../src/sim/Clues';
import { AnimId } from '../src/sim/constants';
import { npcMemory } from '../src/sim/npc/memory';
import { simOf } from '../src/sim/RoomSim';
import { openRun } from './killHelpers';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  npcSeats,
  placeSeat,
  start,
  toWorld,
} from './npcHelpers';

// Presence and animation (GDD 3.12 "Animation"; npc.md part 2, section 3): `interact` while a hold runs, `walk`
// only when the body moved.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const CAST = Math.round((abilities.abilities.collect?.castS ?? 2) * TICK_RATE);
const RUN = openRun('overworld', 8);

async function world(): Promise<Party> {
  const party = await lobbyOf(colyseus, 1);
  await start(party);
  await toWorld(party);
  allTownsfolk(party.room);
  holdPhase(party, Phase.day, 3600);
  return party;
}

const asClient = (id: string) => ({ sessionId: id }) as Client;
const anim = (party: Party, id: string) => party.room.state.players.get(id)!.presence.animId;

/** A footprint clue on the run's first tile; returns its id. */
function clueAt(party: Party, dx = 0): string {
  const id = spawnClue(party.room, 'overworld', {
    kind: ClueKind.footprints,
    value: 0,
    dir: 0,
    tx: RUN.x + dx,
    ty: RUN.y,
    decayS: null,
  });
  return id as string;
}

describe('animation ids', () => {
  it('A5: interact is 4', () => {
    expect(AnimId).toEqual({ idle: 0, walk: 1, swing: 2, die: 3, interact: 4 });
  });
});

describe('interact while holding', () => {
  it('A1: a human shows interact on every tick of a Collect hold, then idle', async () => {
    const party = await world();
    const human = party.humans[0]!.id;
    const clue = clueAt(party);
    placeSeat(party, human, 'overworld', RUN.x, RUN.y);
    const p = simOf(party.room).players.get(human)!;
    party.room.commands.push(asClient(human), 'act.hold', { action: 'collect', targetId: clue, on: true });
    advance(party, 1);
    expect(p.hold).not.toBeNull();
    expect(anim(party, human)).toBe(AnimId.idle);
    for (let i = 1; i <= CAST; i++) {
      advance(party, 1);
      expect(anim(party, human), `tick ${i}`).toBe(AnimId.interact);
    }
    advance(party, 1);
    expect(p.hold).toBeNull();
    expect(anim(party, human)).toBe(AnimId.idle);
  });

  it('A2: a step ends the hold and the next published animation is walk', async () => {
    const party = await world();
    const human = party.humans[0]!.id;
    const clue = clueAt(party);
    placeSeat(party, human, 'overworld', RUN.x, RUN.y);
    const p = simOf(party.room).players.get(human)!;
    party.room.commands.push(asClient(human), 'act.hold', { action: 'collect', targetId: clue, on: true });
    advance(party, 10);
    expect(p.hold).not.toBeNull();
    party.room.commands.push(asClient(human), 'input.move', {
      seq: 1,
      dx: 1,
      dy: 0,
      sprint: false,
      sneak: false,
    });
    advance(party, 1);
    expect(p.hold).toBeNull();
    advance(party, 1);
    expect(anim(party, human)).toBe(AnimId.walk);
  });

  it('A4: an NPC with a hold running shows interact from the next publish until it completes', async () => {
    const party = await world();
    const [npc] = npcSeats(party.room);
    const id = npc!.id;
    const clue = clueAt(party);
    placeSeat(party, id, 'overworld', RUN.x, RUN.y);
    npcMemory(party.room).walk = false;
    const p = simOf(party.room).players.get(id)!;
    p.hold = { action: 'collect', targetId: clue, startTick: party.room.state.tick };
    for (let i = 0; i < CAST; i++) {
      advance(party, 1);
      expect(anim(party, id), `tick ${i}`).toBe(AnimId.interact);
    }
    advance(party, 2);
    expect(p.hold).toBeNull();
    expect(anim(party, id)).toBe(AnimId.idle);
  });
});

describe('walking in place', () => {
  it('A3: a seat pushing into a wall stands idle, one on open floor walks on every tick', async () => {
    const party = await world();
    const human = party.humans[0]!.id;
    const grid = new NavGrid(navs.overworld, simOf(party.room).profile);
    let wall: { x: number; y: number } | null = null;
    for (let y = 1; y < grid.h && !wall; y++)
      for (let x = 1; x < grid.w - 1 && !wall; x++)
        if (!grid.solidAt(x, y) && grid.solidAt(x + 1, y) && !grid.solidAt(x - 1, y)) wall = { x, y };
    expect(wall).not.toBeNull();
    const p = simOf(party.room).players.get(human)!;
    let seq = 0;
    const push = () =>
      party.room.commands.push(asClient(human), 'input.move', {
        seq: ++seq,
        dx: 1,
        dy: 0,
        sprint: false,
        sneak: false,
      });

    placeSeat(party, human, 'overworld', wall!.x, wall!.y);
    const walking: number[] = [];
    let settled: { x: number; y: number } | null = null;
    for (let i = 0; i < 40; i++) {
      push();
      advance(party, 1);
      walking.push(anim(party, human));
      if (i >= 3) {
        settled ??= { x: p.x, y: p.y };
        expect([p.x, p.y]).toEqual([settled.x, settled.y]);
      }
    }
    expect(walking.slice(0, 3).filter((a) => a === AnimId.walk).length).toBeLessThanOrEqual(3);
    expect(walking.slice(3).every((a) => a === AnimId.idle)).toBe(true);

    placeSeat(party, human, 'overworld', RUN.x, RUN.y);
    for (let i = 0; i < 40; i++) {
      push();
      advance(party, 1);
      expect(anim(party, human), `open floor ${i}`).toBe(AnimId.walk);
    }
    void TILE_PX;
  });
});
