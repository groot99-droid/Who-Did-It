import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import {
  C2S,
  ClueKind,
  EntryWeight,
  NotebookEntry,
  NotebookStatus,
  Phase,
  TICK_RATE,
  TribunalStep,
} from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { endTrialOpen } from '../src/sim/law/EndTrial';
import { cuffSeat } from '../src/sim/law/Manhunt';
import { handlePetitionOpen, handlePetitionSign } from '../src/sim/law/Petition';
import { npcMemory } from '../src/sim/npc/memory';
import { npcVoteTarget } from '../src/sim/npc/meeting';
import { figuresOf } from '../src/sim/townsfolk/figures';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  npcSeats,
  pauseClock,
  placeSeat,
  send,
  setRole,
  start,
  toWorld,
} from './npcHelpers';

/**
 * NPC seats present and file (round 10, B6d2; GDD 3.12; seams.md 3 row 35): every NPC seat draws a tick and a chance
 * on its own streams, then does through the human handlers what a human can: presents backed entries against the
 * accused at a Tribunal, files a murder charge at the end trial. A seat with no backed entry does nothing.
 */

const S = (s: number): number => Math.round(s * TICK_RATE);

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Four humans and an NPC seat by day, the Constables off; seat 3 tall with a red scarf, everyone else plain. */
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
const npcId = (party: Party): string => npcSeats(party.room)[0]!.id;
const row = (party: Party) => party.room.state.tribunal;

function entry(party: Party, seat: string, kind: number, value: number): string {
  const e = new NotebookEntry();
  const notebook = party.room.state.players.get(seat)!.priv.notebook;
  e.id = `entry_t${notebook.length + 1}`;
  e.clueKind = kind;
  e.value = value;
  e.sceneId = notebook.length + 1;
  e.status = NotebookStatus.verified;
  notebook.push(e);
  return e.id;
}

function until(party: Party, step: number): void {
  for (let i = 0; i < S(400) && row(party).step !== step; i++) advance(party, 1);
}

/** Makes the NPC's draws for the open step due now and sure to pass, as a white-box stand-in for a lucky roll. */
function dueNow(party: Party, id: string): void {
  advance(party, 1); // the step's draws are made on this tick
  const brain = npcMemory(party.room).brain(id);
  brain.trialRoll = 0;
  brain.trialAtTick = party.room.state.tick;
}

/** A Tribunal on seat 3 (the accused) opens: a warrant with two matches, the cell, the case step. */
function openTribunal(party: Party): void {
  const [a, b, c, d] = ids(party);
  handlePetitionOpen(party.room, a, {
    accused: d,
    charge: 'murder',
    entries: [entry(party, a, ClueKind.footprints, 2)],
  });
  for (const id of [b, c]) handlePetitionSign(party.room, id, { id: party.room.state.petition.id });
  advance(party, 1);
  cuffSeat(party.room, d);
  advance(party, S(balance.jail.walkS) + 1);
  until(party, TribunalStep.case);
}

describe('NPC seats at a Tribunal (GDD 3.12, B6d2)', () => {
  it('presents its backed entry against the accused, with itself as the presenter', async () => {
    const party = await world();
    const npc = npcId(party);
    entry(party, npc, ClueKind.thread, 1); // fits seat 3's red scarf
    openTribunal(party);
    dueNow(party, npc);
    advance(party, 1);
    expect(
      row(party)
        .entries.filter((e) => e.presenter === npc)
        .map((e) => e.weight),
    ).toEqual([EntryWeight.match]);
  });

  it('presents nothing with no backed entry, and the case goes on without it', async () => {
    const party = await world();
    const npc = npcId(party);
    const e = new NotebookEntry();
    e.id = 'entry_unbacked';
    e.clueKind = ClueKind.thread;
    e.value = 1;
    e.sceneId = 1;
    e.status = NotebookStatus.claimed;
    party.room.state.players.get(npc)!.priv.notebook.push(e);
    openTribunal(party);
    dueNow(party, npc);
    advance(party, S(5));
    expect(row(party).entries.some((x) => x.presenter === npc)).toBe(false);
    until(party, TribunalStep.none);
    expect(party.room.state.phase).toBe(Phase.day);
  });

  it('does not wait on the roll: a roll at or above presentChance presents nothing', async () => {
    const party = await world();
    const npc = npcId(party);
    entry(party, npc, ClueKind.thread, 1);
    openTribunal(party);
    advance(party, 1);
    const brain = npcMemory(party.room).brain(npc);
    brain.trialRoll = balance.npc.trial.presentChance;
    brain.trialAtTick = party.room.state.tick;
    advance(party, S(5));
    expect(row(party).entries.some((x) => x.presenter === npc)).toBe(false);
  });

  it('a Cabal NPC does not present against a Cabal accused', async () => {
    const party = await world();
    const npc = npcId(party);
    setRole(party.room, npc, 'killer');
    setRole(party.room, ids(party)[3], 'accomplice');
    entry(party, npc, ClueKind.thread, 1);
    openTribunal(party);
    dueNow(party, npc);
    advance(party, S(3));
    expect(row(party).entries.some((x) => x.presenter === npc)).toBe(false);
  });
});

describe('NPC seats at the end trial (GDD 3.8, 3.12, B6d2)', () => {
  async function filing(): Promise<Party> {
    const party = await world();
    holdPhase(party, Phase.finalNight, 0);
    advance(party, 1);
    expect(endTrialOpen(party.room)).toBe(true);
    for (let i = 0; i < S(10) && row(party).step !== TribunalStep.filing; i++) advance(party, 1);
    return party;
  }

  it('files a murder charge against the seat its vote rule picks, with a backed entry that fits', async () => {
    const party = await filing();
    const npc = npcId(party);
    const target = npcVoteTarget(party.room, npc, undefined, true)!;
    expect(target).not.toBeNull();
    expect(target).not.toBe(npc);
    const traits = party.room.state.players.get(target)!.traits;
    entry(party, npc, ClueKind.footprints, traits.height);
    dueNow(party, npc);
    advance(party, 1);
    const cases = party.room.state.endTrial.cases;
    expect(cases.length).toBe(1);
    expect([cases[0]!.accused, cases[0]!.charge, cases[0]!.filers]).toEqual([target, 'murder', 1]);
    expect(cases[0]!.entries[0]!.presenter).toBe(npc);
  });

  it('files nothing with no backed entry', async () => {
    const party = await filing();
    const npc = npcId(party);
    dueNow(party, npc);
    advance(party, S(5));
    expect(party.room.state.endTrial.cases.length).toBe(0);
  });

  it('draws on its own streams and leaves the public ones alone', async () => {
    const party = await filing();
    const npc = npcId(party);
    advance(party, 2);
    const words = party.room.seeds.recorded();
    expect(Object.keys(words)).toEqual(expect.arrayContaining([`trialTick:${npc}`, `trialChance:${npc}`]));
    for (const id of Object.keys(words)) {
      if (id.startsWith('trial')) continue;
      expect(words[id]).not.toEqual(words[`trialTick:${npc}`]);
    }
  });

  it('puts nothing on the wire that marks the filer as an NPC', async () => {
    const party = await filing();
    const npc = npcId(party);
    const target = npcVoteTarget(party.room, npc, undefined, true)!;
    entry(party, npc, ClueKind.footprints, party.room.state.players.get(target)!.traits.height);
    dueNow(party, npc);
    advance(party, 1);
    const c = party.room.state.endTrial.cases[0]!;
    expect(Object.keys(c.entries[0]!.toJSON()).sort()).toEqual(
      ['backed', 'clueKind', 'presenter', 'sceneId', 'value', 'weight'].sort(),
    );
    expect(Object.keys(c.toJSON()).sort()).toEqual(
      ['accused', 'charge', 'entries', 'exclusions', 'filers', 'matches'].sort(),
    );
    expect(JSON.stringify(party.room.state.toJSON())).not.toMatch(/isNpc/);
  });
});
