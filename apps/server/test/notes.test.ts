import type { Client } from '@colyseus/core';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { C2S, ErrorCode, Phase, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { noteRefusal, postNote } from '../src/sim/Chat';
import { onSim } from '../src/sim/events/bus';
import { simOf } from '../src/sim/RoomSim';
import { NOTE_TEMPLATES, templateNote } from '../src/services/talk/templates';
import type { PublicFacts } from '../src/services/talk/facts';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  errors,
  npcIdsOf,
  standardParty,
} from './npcHelpers';
import { sleep } from './simHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

type Line = { from: string; text: string; channel: string };
const notesOf = (party: Party): Line[] =>
  party.humans[0]!.log.filter((m) => m.type === 'chat.msg')
    .map((m) => m.payload as Line)
    .filter((l) => l.channel === 'notes');

/** Queues a `chat.note` from the human and consumes it on the next step. */
function humanNote(party: Party, text: unknown): void {
  party.room.lobbyCommands.push({ sessionId: party.humans[0]!.id } as Client, C2S.note, { text });
  advance(party, 1);
}

/** Opens a bell meeting called by the human and steps to its discussion. */
function bell(party: Party): void {
  simOf(party.room).meetingRequests.push({ reason: 'bell', callerId: party.humans[0]!.id });
  for (let i = 0; i < 5 && party.room.state.phase !== Phase.meetingDiscussion; i++) advance(party, 1);
}

describe('meeting notes (GDD 3.8)', () => {
  it('a human note reaches everyone with no speaker; refused outside a meeting, too soon and past the cap', async () => {
    const party = await standardParty(colyseus, 'S1');
    allTownsfolk(party.room);
    humanNote(party, 'too early');
    await sleep(100);
    expect(errors(party.humans[0]!).at(-1)).toBe(ErrorCode.wrongPhase);

    bell(party);
    const me = party.humans[0]!.id;
    humanNote(party, '  the baker was by the well  ');
    humanNote(party, 'and again');
    await sleep(100);
    expect(errors(party.humans[0]!).at(-1)).toBe(ErrorCode.cooldown);
    const mine = notesOf(party).filter((l) => l.text === 'the baker was by the well');
    expect(mine).toEqual([{ from: '', text: 'the baker was by the well', channel: 'notes' }]);
    for (const line of notesOf(party)) expect(line.from).toBe('');

    for (let i = 1; i < balance.talk.notesPerMeeting; i++) {
      advance(party, balance.talk.noteGapS * TICK_RATE);
      if (party.room.state.phase !== Phase.meetingDiscussion)
        party.room.state.phase = Phase.meetingDiscussion;
      expect(postNote(party.room, me, `note ${i}`)).toBe(true);
    }
    advance(party, balance.talk.noteGapS * TICK_RATE);
    party.room.state.phase = Phase.meetingVote;
    expect(noteRefusal(party.room, me)).toBe(ErrorCode.cooldown);
    party.room.state.phase = Phase.reveal;
    expect(noteRefusal(party.room, me)).toBe(ErrorCode.cooldown);
  });

  it('a ghost may not write a note', async () => {
    const party = await standardParty(colyseus, 'S2');
    allTownsfolk(party.room);
    bell(party);
    const ghost = npcIdsOf('S2')[0]!;
    simOf(party.room).players.get(ghost)!.dead = true;
    expect(noteRefusal(party.room, ghost)).toBe(ErrorCode.cannot);
    expect(postNote(party.room, ghost, 'boo')).toBe(false);
  });

  it('NPC seats write talk.npc.notesPerMeeting notes inside the window, with no speaker and the human limits', async () => {
    const party = await standardParty(colyseus, 'S1');
    allTownsfolk(party.room);
    bell(party);
    const room = party.room;
    const open = room.state.tick;
    const span = room.state.phaseEndsTick - open + balance.phases.voteS * TICK_RATE;
    const at: number[] = [];
    onSim(room, 'talk.line', (event) => {
      expect(event.seat).toBeUndefined();
      at.push(event.tick);
    });
    while (room.state.phase === Phase.meetingDiscussion || room.state.phase === Phase.meetingVote) {
      advance(party, 1);
    }
    await sleep(150);
    const lines = notesOf(party);
    const { min, max } = balance.talk.npc.notesPerMeeting;
    const npcs = npcIdsOf('S1').length;
    expect(lines.length).toBeGreaterThanOrEqual(npcs * min);
    expect(lines.length).toBeLessThanOrEqual(npcs * max);
    expect(at).toHaveLength(lines.length);
    for (const line of lines) expect(line).toMatchObject({ from: '', channel: 'notes' });
    const f = balance.talk.npc.windowFrac;
    for (const tick of at) {
      expect(tick - open).toBeGreaterThanOrEqual(Math.floor(span * f.min));
      expect(tick - open).toBeLessThanOrEqual(
        Math.ceil(span * f.max) + balance.talk.noteGapS * TICK_RATE * max,
      );
    }
  });
});

describe('note templates (GDD 3.25)', () => {
  const facts: PublicFacts = {
    round: 1,
    reason: 'body',
    caller: 'Ada',
    body: 'Bo',
    missing: [],
    others: ['Ada', 'Cy'],
  };

  it('fills every placeholder and never names a card or a role', () => {
    const words = ['killer', 'accomplice', 'detective', 'doctor', 'vicar', 'cabal', 'drifter', 'gamekeeper'];
    for (let i = 0; i < 200; i++) {
      const line = templateNote(facts, Math.random);
      expect(line).not.toMatch(/[{}]/);
      for (const word of words) expect(line.toLowerCase()).not.toContain(word);
    }
    for (const t of NOTE_TEMPLATES) for (const word of words) expect(t.toLowerCase()).not.toContain(word);
  });

  it('draws only lines whose facts exist', () => {
    const bare: PublicFacts = { ...facts, reason: 'bell', caller: '', body: '', others: [] };
    for (let i = 0; i < 200; i++) expect(templateNote(bare, Math.random)).not.toMatch(/[{}]|undefined/);
  });
});
