import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import {
  C2S,
  ClueKind,
  NotebookEntry,
  NotebookStatus,
  Phase,
  S2C,
  TICK_RATE,
  TribunalFinding,
  TribunalSentence,
  TribunalStep,
  Winner,
} from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { endTrialOpen, handleFile } from '../src/sim/law/EndTrial';
import { cuffSeat } from '../src/sim/law/Manhunt';
import { handlePetitionOpen, handlePetitionSign } from '../src/sim/law/Petition';
import { simOf } from '../src/sim/RoomSim';
import { figuresOf } from '../src/sim/townsfolk/figures';
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
 * The Final Night's end trial (round 10, B6d; GDD 3.8, `phases.md` 5; seams.md 3 row 35): the hunt's end gathers the
 * town, every living free seat files one case, the cases are read strongest first with B6a's verdict, the first
 * murder conviction of the Killer ends it for the Village, and with none the Killer is Unseen.
 */

const S = (s: number): number => Math.round(s * TICK_RATE);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Four humans and an NPC seat; seat 3 the Killer, tall with a green scarf; the hunt about to end. */
async function finalNight(): Promise<Party> {
  const party = await lobbyOf(colyseus, 4);
  await send(party.humans[0]!, C2S.lobbyAddNpc);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  party.humans.forEach((h, i) => placeSeat(party, h.id, 'overworld', 34 + i, 21));
  for (const f of figuresOf(party.room).values()) if (f.kind === 'constable') f.dead = true;
  for (const p of party.room.state.players.values()) p.traits.height = p.traits.scarf = 0;
  const [, , , d] = ids(party);
  const t = party.room.state.players.get(d)!.traits;
  t.height = 2;
  t.scarf = 1;
  setRole(party.room, d, 'killer');
  return party;
}

/** The hunt runs out: the end trial opens on the next step. */
function endHunt(party: Party): void {
  holdPhase(party, Phase.finalNight, 0);
  advance(party, 1);
}

const ids = (party: Party) => party.humans.map((h) => h.id) as [string, string, string, string];
const row = (party: Party) => party.room.state.tribunal;
const reasons = (h: Human): string[] =>
  h.log.filter((m) => m.type === 'error').map((m) => (m.payload as { reason?: string }).reason ?? '');
function until(party: Party, step: number): void {
  for (let i = 0; i < S(400) && row(party).step !== step && endTrialOpen(party.room); i++) advance(party, 1);
}

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

function gameOver(h: Human): { winner: number; unseen?: boolean } | undefined {
  return h.log.find((m) => m.type === S2C.gameOver)?.payload as
    { winner: number; unseen?: boolean } | undefined;
}

describe("the Final Night's end trial (GDD 3.8, B6d)", () => {
  it('gathers, takes filings, and a murder conviction of the Killer ends it for the Village', async () => {
    const party = await finalNight();
    const [a, b, , d] = ids(party);
    endHunt(party);
    expect(party.room.state.phase).toBe(Phase.tribunal);
    expect(row(party).step).toBe(TribunalStep.gathering);
    until(party, TribunalStep.filing);
    handleFile(party.room, a, {
      accused: d,
      charge: 'murder',
      entries: [entry(party, a, ClueKind.footprints, 2)],
    });
    handleFile(party.room, b, {
      accused: d,
      charge: 'robbery',
      entries: [entry(party, b, ClueKind.thread, 1)],
    });
    const cases = party.room.state.endTrial.cases;
    expect(cases.length).toBe(1); // one case per accused, the cards joined
    expect([cases[0]!.charge, cases[0]!.filers, cases[0]!.matches]).toEqual(['murder', 2, 2]);
    until(party, TribunalStep.verdict);
    expect([row(party).accused, row(party).finding, row(party).sentence]).toEqual([
      d,
      TribunalFinding.murder,
      TribunalSentence.death,
    ]);
    expect(simOf(party.room).players.get(d)!.dead).toBe(true);
    for (let i = 0; i < S(30) && party.room.state.phase !== Phase.gameOver; i++) advance(party, 1);
    await sleep(150);
    const over = gameOver(party.humans[0]!);
    expect(over?.winner).toBe(Winner.village);
    expect(over?.unseen).toBeUndefined();
  });

  it('with no case the Killer walks free: the Cabal wins Unseen', async () => {
    const party = await finalNight();
    endHunt(party);
    until(party, TribunalStep.filing);
    for (let i = 0; i < S(200) && party.room.state.phase !== Phase.gameOver; i++) advance(party, 1);
    await sleep(150);
    for (const h of party.humans) expect(gameOver(h)).toMatchObject({ winner: Winner.cabal, unseen: true });
  });

  it('reads the strongest case first; a hanged innocent is read out and the next case follows', async () => {
    const party = await finalNight();
    const [a, b, c, d] = ids(party);
    endHunt(party);
    until(party, TribunalStep.filing);
    // c (short, red scarf) on two matching cards, filed first; d on one card only.
    handleFile(party.room, a, {
      accused: d,
      charge: 'murder',
      entries: [entry(party, a, ClueKind.footprints, 2)],
    });
    handleFile(party.room, b, {
      accused: c,
      charge: 'murder',
      entries: [entry(party, b, ClueKind.footprints, 0)],
    });
    handleFile(party.room, d, {
      accused: c,
      charge: 'murder',
      entries: [entry(party, d, ClueKind.thread, 0)],
    });
    until(party, TribunalStep.verdict);
    expect([row(party).accused, row(party).sentence]).toEqual([c, TribunalSentence.death]);
    advance(party, S(balance.phases.revealS));
    expect([row(party).accused, row(party).finding]).toEqual([d, TribunalFinding.dismissed]);
    for (let i = 0; i < S(30) && party.room.state.phase !== Phase.gameOver; i++) advance(party, 1);
    await sleep(150);
    expect(gameOver(party.humans[0]!)).toMatchObject({ winner: Winner.cabal, unseen: true });
  });

  it('refuses a filing outside the window, against oneself or with a bad charge; the bells emptied the cell', async () => {
    const party = await finalNight();
    const [a, b, c, d] = ids(party);
    holdPhase(party, Phase.day, 3600);
    advance(party, 1);
    handleFile(party.room, a, { accused: d, charge: 'murder', entries: [] }); // no end trial
    // c is cuffed on a robbery warrant; the Final Night's bells empty the cell (GDD 3.27), so it attends and files.
    handlePetitionOpen(party.room, a, { accused: c, charge: 'robbery', entries: [] });
    for (const id of [b, d]) handlePetitionSign(party.room, id, { id: party.room.state.petition.id });
    advance(party, 1);
    cuffSeat(party.room, c);
    endHunt(party);
    until(party, TribunalStep.filing);
    handleFile(party.room, c, { accused: d, charge: 'murder', entries: [] });
    handleFile(party.room, b, { accused: b, charge: 'murder', entries: [] });
    handleFile(party.room, d, { accused: a, charge: 'piracy', entries: [] });
    await sleep(150);
    expect(reasons(party.humans[0]!)).toEqual(['PHASE_CLOSED']);
    expect(reasons(party.humans[2]!)).toEqual([]);
    expect(party.room.state.endTrial.cases.map((x) => x.accused)).toEqual([d]);
    expect(reasons(party.humans[1]!)).toContain('NO_TARGET');
    expect(reasons(party.humans[3]!)).toContain('BAD_REQUEST');
  });

  it('A170: every client decodes the same cases, which name no card', async () => {
    const party = await finalNight();
    const [a, , , d] = ids(party);
    endHunt(party);
    until(party, TribunalStep.filing);
    handleFile(party.room, a, {
      accused: d,
      charge: 'murder',
      entries: [entry(party, a, ClueKind.footprints, 2)],
    });
    advance(party, 1);
    await sleep(150);
    const seen = party.humans.map((h) => JSON.stringify(stateOf(h).endTrial));
    expect(new Set(seen).size).toBe(1);
    expect(seen[0]).not.toContain('killer');
  });
});
