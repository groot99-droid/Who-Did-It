import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { avatarMemory } from '../src/sim/Avatars';
import { simOf } from '../src/sim/RoomSim';
import {
  type Human,
  type Party,
  advance,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  pauseClock,
  placeSeat,
  send,
  start,
  toWorld,
} from './npcHelpers';

// Round 10, M1 (seams.md 3 row 36): `chat.quick` and the bark every actor sends the same way.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

type Bark = { handle: string; phraseId: string };
const barks = (h: Human) => h.log.filter((m) => m.type === 'bark').map((m) => m.payload as Bark);
const reasons = (h: Human) =>
  h.log.filter((m) => m.type === 'error').map((m) => (m.payload as { reason?: string }).reason);
const POOL = balance.chat.quickChat.map((l) => l.id);

async function world(humans: number, npcs = 2): Promise<Party> {
  const party = await lobbyOf(colyseus, humans);
  for (let i = 0; i < npcs; i++) await send(party.humans[0]!, 'lobby.addNpc', {}, 40);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  holdPhase(party, Phase.day, 36000);
  advance(party, 1);
  return party;
}

describe('the bark pool', () => {
  it('has unique ids, moments drawn from it, and an idle gap that reaches the human rate', () => {
    expect(new Set(POOL).size).toBe(POOL.length);
    expect(POOL.length).toBeGreaterThanOrEqual(8);
    for (const ids of Object.values(balance.bark.moments)) for (const id of ids) expect(POOL).toContain(id);
    expect(balance.bark.idleGapS.min).toBe(balance.chat.quickGapS);
  });
});

describe('chat.quick', () => {
  it('reaches the speaker and a near seat as the same payload, and not a seat in another scene', async () => {
    const party = await world(3, 0);
    const [a, b, c] = party.humans as [Human, Human, Human];
    placeSeat(party, a.id, 'overworld', 10, 10);
    placeSeat(party, b.id, 'overworld', 12, 10);
    placeSeat(party, c.id, 'tavern_bar', 5, 5);
    advance(party, 2);
    await send(a, 'chat.quick', { phraseId: 'followMe' }, 40);
    advance(party, 1);
    await send(a, 'net.ping', {}, 60);
    const handle = avatarMemory(party.room).handleOf.get(a.id);
    expect(barks(a)).toEqual([{ handle, phraseId: 'followMe' }]);
    expect(barks(b)).toEqual(barks(a));
    expect(barks(c)).toHaveLength(0);
    expect(JSON.stringify(barks(b))).not.toContain(a.id);
  });

  it('refuses an unknown id, a repeat inside the gap and a ghost, each with its reason', async () => {
    const party = await world(2, 0);
    const [a, b] = party.humans as [Human, Human];
    await send(a, 'chat.quick', { phraseId: 'nope' }, 40);
    advance(party, 1);
    await send(a, 'chat.quick', { phraseId: 'wait' }, 40);
    advance(party, 1);
    await send(a, 'chat.quick', { phraseId: 'wait' }, 40);
    advance(party, 1);
    simOf(party.room).players.get(b.id)!.dead = true;
    await send(b, 'chat.quick', { phraseId: 'wait' }, 40);
    advance(party, 1);
    await send(a, 'net.ping', {}, 60);
    expect(reasons(a)).toEqual(['UNKNOWN_PHRASE', 'CHAT_RATE']);
    expect(reasons(b)).toEqual(['NOT_IN_PLAY']);
  });

  it('is closed outside the world phases', async () => {
    const party = await world(1, 2);
    const a = party.humans[0]!;
    holdPhase(party, Phase.meetingDiscussion, 60);
    await send(a, 'chat.quick', { phraseId: 'wait' }, 40);
    advance(party, 1);
    await send(a, 'net.ping', {}, 60);
    expect(reasons(a)).toEqual(['PHASE_CLOSED']);
    expect(barks(a)).toHaveLength(0);
  });
});

describe('NPC and figure barks', () => {
  it('bark pool lines on their own, in the shape a human bark has, with no seat in them', async () => {
    const party = await world(1, 4);
    const a = party.humans[0]!;
    const sim = simOf(party.room);
    // Stand the human among the others so it hears them.
    const npc = [...sim.players.keys()].filter((id) => id !== a.id);
    for (const id of npc) placeSeat(party, id, 'overworld', 11, 11);
    placeSeat(party, a.id, 'overworld', 10, 11);
    advance(party, 60 * TICK_RATE);
    await send(a, 'net.ping', {}, 60);
    const heard = barks(a);
    expect(heard.length).toBeGreaterThan(0);
    for (const b of heard) {
      expect(Object.keys(b).sort()).toEqual(['handle', 'phraseId']);
      expect(POOL).toContain(b.phraseId);
      expect(npc).not.toContain(b.handle);
    }
  });
});
