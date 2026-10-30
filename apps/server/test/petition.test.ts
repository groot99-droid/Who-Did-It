import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { ClueKind, NotebookEntry, NotebookStatus, Phase, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handlePetitionOpen, handlePetitionSign, warrantsOf } from '../src/sim/law/Petition';
import { isNpcSeat } from '../src/sim/Npc';
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
 * Petitions (round 10, B3a; GDD 3.31; seams.md 3 row 13): one open in the town at a time, at a notice board; the
 * others-needed bar; a pass leaves a warrant, a lapse a grace for the accused and the opener; only clue entries
 * attach, shown as anyone may read them; the Constable's signature at 5 humans or fewer; no opener or signer public.
 */

const S = (s: number): number => Math.round(s * TICK_RATE);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Three humans by day on HollowMere at the square's notice board (ov.board, 35,20); the NPC fill is the accused. */
async function world(): Promise<Party> {
  const party = await lobbyOf(colyseus, 3);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  holdPhase(party, Phase.day, 3600);
  party.humans.forEach((h, i) => placeSeat(party, h.id, 'overworld', 34 + i, 21));
  advance(party, 1);
  return party;
}

const accusedOf = (party: Party): string =>
  [...party.room.state.players.keys()].find((id) => isNpcSeat(party.room, id))!;
const row = (party: Party) => party.room.state.petition;
const reasons = (h: Human): string[] =>
  h.log.filter((m) => m.type === 'error').map((m) => (m.payload as { reason?: string }).reason ?? '');

/** Pushes a clue entry into a seat's Notebook and returns its id. */
function entry(party: Party, seat: string, kind: number, value: number, status: number, note = 0): string {
  const e = new NotebookEntry();
  const notebook = party.room.state.players.get(seat)!.priv.notebook;
  e.id = `entry_t${notebook.length + 1}`;
  e.clueKind = kind;
  e.value = value;
  e.status = status;
  e.note = note;
  notebook.push(e);
  return e.id;
}

describe('petitions (GDD 3.31)', () => {
  it('opens at a board, needs the others, passes on a signature into a warrant; one at a time', async () => {
    const party = await world();
    const [a, b, c] = party.humans.map((h) => h.id) as [string, string, string];
    const accused = accusedOf(party);
    handlePetitionOpen(party.room, a, { accused, charge: 'robbery', entries: [] });
    expect(row(party).id).not.toBe('');
    expect([row(party).accused, row(party).charge]).toEqual([accused, 'robbery']);
    expect(row(party).needed).toBe(Math.ceil(balance.petition.othersPct * 3));
    expect(row(party).signed).toBe(0);
    handlePetitionOpen(party.room, c, { accused: a, charge: 'assault', entries: [] }); // one at a time, town-wide
    handlePetitionSign(party.room, a, { id: row(party).id }); // the opener never signs its own
    await sleep(150);
    expect(reasons(party.humans[2]!)).toContain('PETITION_OPEN');
    expect(reasons(party.humans[0]!)).toContain('BUSY');
    // The signature is a count: no seat id under the public row; the signer alone learns it signed.
    handlePetitionSign(party.room, b, { id: row(party).id });
    expect(party.room.state.players.get(b)!.priv.petitionSigned).toBe(true);
    expect(JSON.stringify(row(party).toJSON())).not.toContain(b);
    expect(JSON.stringify(row(party).toJSON())).not.toContain(a);
    advance(party, 1);
    expect(warrantsOf(party.room).map((w) => [w.accused, w.charge])).toEqual([[accused, 'robbery']]);
    expect(row(party).id).toBe('');
    expect(party.room.state.players.get(b)!.priv.petitionSigned).toBe(false);
  });

  it('lapses at openS; the accused and the opener wait cooldownS, another accused may be named at once', async () => {
    const party = await world();
    const [a, b] = party.humans.map((h) => h.id) as [string, string];
    const accused = accusedOf(party);
    handlePetitionOpen(party.room, a, { accused, charge: 'theft', entries: [] });
    advance(party, S(balance.petition.openS) + 1);
    expect(row(party).id).toBe('');
    expect(warrantsOf(party.room)).toHaveLength(0);
    handlePetitionOpen(party.room, a, { accused: b, charge: 'theft', entries: [] }); // the opener waits
    handlePetitionOpen(party.room, b, { accused, charge: 'theft', entries: [] }); // so does the accused
    await sleep(150);
    expect(reasons(party.humans[0]!)).toContain('PETITION_GRACE');
    expect(reasons(party.humans[1]!)).toContain('PETITION_GRACE');
    handlePetitionOpen(party.room, b, { accused: a, charge: 'theft', entries: [] });
    expect(row(party).accused).toBe(a);
  });

  it('refuses away from a board, a night-power, Forged or teaching entry, and an unknown charge', async () => {
    const party = await world();
    const [a] = party.humans.map((h) => h.id) as [string];
    const accused = accusedOf(party);
    const confession = entry(party, a, 0, 0, NotebookStatus.verified, 1);
    const forged = entry(party, a, ClueKind.footprints, 1, NotebookStatus.forged);
    for (const entries of [[confession], [forged]])
      handlePetitionOpen(party.room, a, { accused, charge: 'robbery', entries });
    handlePetitionOpen(party.room, a, { accused, charge: 'jaywalking', entries: [] });
    placeSeat(party, a, 'overworld', 10, 10);
    handlePetitionOpen(party.room, a, { accused, charge: 'robbery', entries: [] });
    await sleep(150);
    expect(reasons(party.humans[0]!)).toEqual(['BAD_REQUEST', 'BAD_REQUEST', 'BAD_REQUEST', 'TOO_FAR']);
    expect(row(party).id).toBe('');
  });

  it("shows entries as anyone may read them: the same public row whoever opens, a role's reading blank", async () => {
    const rows: string[] = [];
    for (const role of ['detective', 'townsfolk']) {
      const party = await world();
      const [a] = party.humans.map((h) => h.id) as [string];
      setRole(party.room, a, role);
      const prints = entry(party, a, ClueKind.footprints, 2, NotebookStatus.claimed);
      const felt = entry(party, a, ClueKind.felt, 1, NotebookStatus.claimed);
      handlePetitionOpen(party.room, a, {
        accused: accusedOf(party),
        charge: 'murder',
        entries: [prints, felt],
      });
      const json = row(party).toJSON() as Record<string, unknown>;
      expect(json.entries).toEqual([
        { clueKind: ClueKind.footprints, value: 2, sceneId: 0, backed: false },
        { clueKind: ClueKind.felt, value: 0, sceneId: 0, backed: false },
      ]);
      rows.push(JSON.stringify({ ...json, accused: '', untilTick: 0 }));
    }
    expect(rows[0]).toBe(rows[1]);
  });

  it('a Constable signs once at 5 humans or fewer on two backed matches against the public traits', async () => {
    const party = await world();
    const [a] = party.humans.map((h) => h.id) as [string];
    const accused = accusedOf(party);
    const t = party.room.state.players.get(accused)!.traits;
    const prints = entry(party, a, ClueKind.footprints, t.height, NotebookStatus.verified);
    const thread = entry(party, a, ClueKind.thread, t.scarf, NotebookStatus.corroborated);
    handlePetitionOpen(party.room, a, { accused, charge: 'murder', entries: [prints, thread] });
    advance(party, 1);
    // One signature, the Constable's: at 3 humans the bar is 1, so it passes.
    expect(warrantsOf(party.room)).toHaveLength(1);
    // A mismatched trait gives no signature.
    advance(party, S(1));
    const other = entry(party, a, ClueKind.footprints, (t.height + 1) % 3, NotebookStatus.verified);
    handlePetitionOpen(party.room, a, { accused, charge: 'murder', entries: [other, thread] });
    advance(party, 2);
    expect(row(party).signed).toBe(0);
  });

  it('A170 on the wire: over the two messages, every client decodes the same row, counts only, no opener or signer', async () => {
    const party = await world();
    const [a, b] = party.humans.map((h) => h.id) as [string, string];
    const accused = accusedOf(party);
    const prints = entry(party, a, ClueKind.footprints, 1, NotebookStatus.verified);
    const felt = entry(party, a, ClueKind.felt, 2, NotebookStatus.verified);
    await send(party.humans[0]!, 'petition.open', { accused, charge: 'assault', entries: [prints, felt] });
    advance(party, 1);
    await sleep(150);
    const id = row(party).id;
    await send(party.humans[1]!, 'petition.sign', { id });
    // Before the step consumes the sign, read every client's decoded row; then step and read again.
    const seen: string[] = [];
    for (const h of party.humans) seen.push(JSON.stringify(stateOf(h).petition));
    expect(new Set(seen).size).toBe(1);
    const decoded = JSON.parse(seen[0]!) as { entries: Record<string, unknown>[]; signed: number };
    for (const e of decoded.entries)
      expect(Object.keys(e).sort()).toEqual(['backed', 'clueKind', 'sceneId', 'value']);
    expect(decoded.entries[1]).toMatchObject({ clueKind: ClueKind.felt, value: 0, backed: true }); // a role's reading
    for (const text of seen) for (const who of [a, b]) expect(text).not.toContain(who);
    // No message to any client names the opener or the signer beside a petition.
    for (const h of party.humans)
      for (const m of h.log) {
        const text = JSON.stringify(m.payload ?? '');
        if (text.includes('petition')) for (const who of [a, b]) expect(text).not.toContain(who);
      }
    // Only the signer's own view knows it signed.
    expect(party.room.state.players.get(b)!.priv.petitionSigned).toBe(false); // the sign is not yet consumed
    advance(party, 1);
    await sleep(150);
    expect(warrantsOf(party.room)).toHaveLength(1); // consumed in step(): the one signature passed it
  });
});
