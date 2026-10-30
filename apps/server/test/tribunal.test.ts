import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import {
  C2S,
  ClueKind,
  EntryWeight,
  NotebookEntry,
  NotebookStatus,
  Phase,
  S2C,
  TICK_RATE,
  TribunalFinding,
  TribunalSentence,
  TribunalStep,
} from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { avatarMemory } from '../src/sim/Avatars';
import { TOWN, balanceOf, movePurse } from '../src/sim/economy/purse';
import { simOf } from '../src/sim/RoomSim';
import { CELL, isJailed } from '../src/sim/law/Jail';
import { cuffSeat } from '../src/sim/law/Manhunt';
import { handlePetitionOpen, handlePetitionSign } from '../src/sim/law/Petition';
import { handlePresent, tribunalOpen } from '../src/sim/law/Tribunal';
import { hubOf } from '../src/sim/MapSites';
import { figuresOf } from '../src/sim/townsfolk/figures';
import { sceneIndex } from '../src/sim/World';
import {
  type Human,
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  pauseClock,
  placeSeat,
  send,
  setRole,
  start,
  stateOf,
  toWorld,
} from './npcHelpers';

/**
 * The Tribunal (round 10, B6a; GDD 3.8; seams.md 3 row 22): it opens when the held seat is placed in the cell, pauses
 * the world, weighs the warrant's and the presented entries against the accused's public traits, and sentences by the
 * charge; a dismissal or a paid fine releases the held seat at the Return, then the world resumes.
 */

const S = (s: number): number => Math.round(s * TICK_RATE);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tr = balance.trial;

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Four humans by day at the notice board, an NPC seat, the Constables off; seat 3 tall with a red scarf. */
async function world(): Promise<Party> {
  const party = await lobbyOf(colyseus, 4);
  await send(party.humans[0]!, C2S.lobbyAddNpc);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  holdPhase(party, Phase.day, 3600);
  party.humans.forEach((h, i) => placeSeat(party, h.id, 'overworld', 34 + i, 21));
  for (const f of figuresOf(party.room).values()) if (f.kind === 'constable') f.dead = true;
  for (const p of party.room.state.players.values()) p.traits.height = p.traits.scarf = 0;
  const t = party.room.state.players.get(party.humans[3]!.id)!.traits;
  t.height = 2;
  t.scarf = 1;
  advance(party, 1);
  return party;
}

const ids = (party: Party) => party.humans.map((h) => h.id) as [string, string, string, string];

/** A clue entry in a seat's Notebook; returns its id. */
function entry(
  party: Party,
  seat: string,
  kind: number,
  value: number,
  status: number = NotebookStatus.verified,
): string {
  const e = new NotebookEntry();
  const notebook = party.room.state.players.get(seat)!.priv.notebook;
  e.id = `entry_t${notebook.length + 1}`;
  e.clueKind = kind;
  e.value = value;
  e.sceneId = notebook.length + 1;
  e.status = status;
  notebook.push(e);
  return e.id;
}

/** Seat 0 opens against seat 3 with `entries` and two sign; the warrant hunts the next tick. */
function warrant(party: Party, charge: string, entries: string[]): void {
  const [a, b, c, d] = ids(party);
  handlePetitionOpen(party.room, a, { accused: d, charge, entries });
  for (const id of [b, c]) handlePetitionSign(party.room, id, { id: party.room.state.petition.id });
  advance(party, 1);
}

/** Cuffs `seat` and walks it to the cell: the Tribunal opens on the placement. */
function cuffAndWalk(party: Party, seat: string): void {
  cuffSeat(party.room, seat);
  advance(party, S(balance.jail.walkS) + 1);
}

const row = (party: Party) => party.room.state.tribunal;
const inCell = (party: Party, seat: string) =>
  simOf(party.room).players.get(seat)!.sceneIdx === sceneIndex(CELL);
const reasons = (h: Human): string[] =>
  h.log.filter((m) => m.type === 'error').map((m) => (m.payload as { reason?: string }).reason ?? '');
/** Runs the Tribunal to the start of `step`. */
function until(party: Party, step: number): void {
  for (let i = 0; i < S(200) && row(party).step !== step; i++) advance(party, 1);
}

describe('the Tribunal (GDD 3.8, B6a)', () => {
  it('opens on the placement, pauses the world, gathers the free and leaves the dock; resumes after the Return', async () => {
    const party = await world();
    const [a, b, c, d] = ids(party);
    const fit = [entry(party, a, ClueKind.footprints, 2), entry(party, a, ClueKind.thread, 1)];
    warrant(party, 'robbery', fit);
    placeSeat(party, c, 'bakery', 4, 4);
    simOf(party.room).players.get(b)!.dead = true; // a death the square would show
    const left = party.room.state.phaseEndsTick - party.room.state.tick;
    cuffAndWalk(party, d);
    expect(party.room.state.phase).toBe(Phase.tribunal);
    expect([row(party).accused, row(party).charge, row(party).step]).toEqual([
      d,
      'robbery',
      TribunalStep.charge,
    ]);
    expect(party.room.state.players.get(b)!.alive).toBe(false);
    expect(inCell(party, d)).toBe(true);
    expect(simOf(party.room).players.get(c)!.sceneIdx).toBe(sceneIndex(hubOf(party.room)));
    expect(row(party).entries.map((e) => [e.presenter, e.weight])).toEqual([
      ['', EntryWeight.match],
      ['', EntryWeight.match],
    ]);
    until(party, TribunalStep.return);
    until(party, TribunalStep.none);
    expect(tribunalOpen(party.room)).toBe(false);
    expect(inCell(party, d)).toBe(true); // jailed until the morning train
    expect(party.room.state.phase).toBe(Phase.day);
    // The paused day keeps the seconds it had, less the walk.
    expect(party.room.state.phaseEndsTick - party.room.state.tick).toBeGreaterThan(
      left - S(balance.jail.walkS) - 5,
    );
  });

  it('proves murder at murderAt matches: the held seat dies and its true role goes to every client', async () => {
    const party = await world();
    const [a, , , d] = ids(party);
    setRole(party.room, d, 'killer');
    warrant(party, 'murder', [entry(party, a, ClueKind.footprints, 2), entry(party, a, ClueKind.thread, 1)]);
    cuffAndWalk(party, d);
    until(party, TribunalStep.verdict);
    expect([row(party).finding, row(party).sentence]).toEqual([
      TribunalFinding.murder,
      TribunalSentence.death,
    ]);
    expect(simOf(party.room).players.get(d)!.dead).toBe(true);
    await sleep(150);
    for (const h of party.humans)
      expect(h.log.filter((m) => m.type === S2C.tribunalVerdict).map((m) => m.payload)).toEqual([
        { roleId: 'killer' },
      ]);
  });

  it('dismisses on any exclusion, releases the held seat at the Return, and graces the accused', async () => {
    const party = await world();
    const [a, b, , d] = ids(party);
    warrant(party, 'robbery', [entry(party, a, ClueKind.footprints, 2), entry(party, a, ClueKind.thread, 1)]);
    cuffAndWalk(party, d);
    until(party, TribunalStep.case);
    handlePresent(party.room, b, { entryId: entry(party, b, ClueKind.footprints, 0) }); // short: rules d out
    expect(row(party).exclusions).toBe(1);
    until(party, TribunalStep.verdict);
    expect([row(party).finding, row(party).sentence]).toEqual([
      TribunalFinding.dismissed,
      TribunalSentence.release,
    ]);
    until(party, TribunalStep.return);
    expect(isJailed(party.room, d)).toBe(false);
    expect(party.room.state.players.get(d)!.priv.jailUntilTick).toBe(0);
    until(party, TribunalStep.none);
    handlePetitionOpen(party.room, a, { accused: d, charge: 'theft', entries: [] });
    await sleep(150);
    expect(reasons(party.humans[0]!)).toContain('PETITION_GRACE');
  });

  it('a fine comes from the charge alone; a purse short of it serves the shortfall in jail', async () => {
    for (const short of [false, true]) {
      const party = await world();
      const [a, , , d] = ids(party);
      const purse = balanceOf(party.room, d);
      movePurse(party.room, d, TOWN, purse, 'fine');
      movePurse(party.room, TOWN, d, short ? tr.theftFine - 1 : tr.theftFine + 3, 'stake');
      warrant(party, 'theft', [entry(party, a, ClueKind.footprints, 2), entry(party, a, ClueKind.thread, 1)]);
      cuffAndWalk(party, d);
      until(party, TribunalStep.verdict);
      expect(row(party).sentence).toBe(short ? TribunalSentence.fineJail : TribunalSentence.fine);
      expect(balanceOf(party.room, d)).toBe(short ? 0 : 3);
      until(party, TribunalStep.none);
      expect(isJailed(party.room, d)).toBe(short);
    }
  });

  it('refuses a present outside the steps, over the limit, a clue twice, a non-exclusion in the defence', async () => {
    const party = await world();
    const [a, b, c, d] = ids(party);
    const warranted = entry(party, a, ClueKind.footprints, 2);
    warrant(party, 'robbery', [warranted]);
    cuffAndWalk(party, d);
    handlePresent(party.room, b, { entryId: entry(party, b, ClueKind.thread, 1) }); // the charge step
    until(party, TribunalStep.case);
    handlePresent(party.room, a, { entryId: warranted }); // already on the scales
    handlePresent(party.room, b, { entryId: entry(party, b, ClueKind.thread, 1) });
    handlePresent(party.room, b, { entryId: entry(party, b, ClueKind.felt, 0) }); // over presentPerPlayer
    until(party, TribunalStep.defence);
    handlePresent(party.room, c, { entryId: entry(party, c, ClueKind.thread, 1, NotebookStatus.claimed) });
    await sleep(150);
    expect(reasons(party.humans[0]!)).toEqual(['ALREADY_DONE']);
    expect(reasons(party.humans[1]!)).toEqual(['PHASE_CLOSED', 'SPENT']);
    expect(reasons(party.humans[2]!)).toEqual(['PHASE_CLOSED']);
    expect(row(party).entries.map((e) => [e.presenter, e.weight])).toEqual([
      ['', EntryWeight.match],
      [b, EntryWeight.match],
    ]);
  });

  it('A170: an impersonator held in the face is tried as the accused; the dock presents nothing; one row for all', async () => {
    const party = await world();
    const [a, b, , d] = ids(party);
    warrant(party, 'robbery', [entry(party, a, ClueKind.footprints, 2), entry(party, a, ClueKind.thread, 1)]);
    placeSeat(party, d, 'bakery', 4, 4);
    avatarMemory(party.room).disguise.set(b, {
      as: d,
      applied: true,
      dropRequested: false,
      applyByTick: 0,
      untilTick: Number.MAX_SAFE_INTEGER,
    });
    simOf(party.room).viewsDirty = true;
    advance(party, 1);
    cuffAndWalk(party, b);
    expect(row(party).accused).toBe(d);
    until(party, TribunalStep.case);
    handlePresent(party.room, b, { entryId: entry(party, b, ClueKind.thread, 0) });
    handlePresent(party.room, d, { entryId: entry(party, d, ClueKind.footprints, 0) }); // the free accused defends
    await sleep(150);
    expect(reasons(party.humans[1]!)).toEqual(['IN_JAIL']);
    expect(row(party).entries.some((e) => e.presenter === b)).toBe(false);
    const seen = party.humans.map((h) => JSON.stringify(stateOf(h).tribunal));
    expect(new Set(seen).size).toBe(1);
    expect(seen[0]).not.toContain(a); // never the opener
    expect(seen[0]).not.toContain(b); // never the held seat
  });

  it('never opens during the Final Night', async () => {
    const party = await world();
    const [a, , , d] = ids(party);
    warrant(party, 'robbery', [entry(party, a, ClueKind.footprints, 2)]);
    holdPhase(party, Phase.finalNight, 300);
    cuffSeat(party.room, d);
    advance(party, S(balance.jail.walkS) + 2);
    expect(tribunalOpen(party.room)).toBe(false);
    expect(party.room.state.phase).toBe(Phase.finalNight);
  });
});
