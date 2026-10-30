import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, looks, roles, scenes, talk } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { avatarMemory } from '../src/sim/Avatars';
import { ledgerOf } from '../src/sim/economy/rumours';
import { briefingsOf } from '../src/sim/law/Briefing';
import { simOf } from '../src/sim/RoomSim';
import { type Figure, figuresOf } from '../src/sim/townsfolk/figures';
import { sceneKey } from '../src/sim/World';
import {
  type Human,
  type Party,
  advance,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  pauseClock,
  send,
  start,
  toWorld,
} from './npcHelpers';

// Round 10 (D9c; GDD 3.24 "Talk to a figure", seams.md 3 row 16): `talk.ask` is answered to the asker alone.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const DELAY = Math.round(balance.figureTalk.delayS * TICK_RATE);
const lines = (h: Human) =>
  h.log
    .filter((m) => m.type === 'chat.msg')
    .map((m) => m.payload as { from: string; text: string; channel: string });
const reasons = (h: Human) =>
  h.log.filter((m) => m.type === 'error').map((m) => (m.payload as { reason?: string }).reason);

async function world(humans = 1): Promise<Party> {
  const party = await lobbyOf(colyseus, humans);
  await send(party.humans[0]!, 'lobby.addNpc', {}, 40);
  await send(party.humans[0]!, 'lobby.addNpc', {}, 40);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  holdPhase(party, Phase.day, 3600);
  advance(party, 1);
  return party;
}

/** Stands the figure of `kind` on the asker's tile (held idle, so its handle stays). */
function figureBeside(party: Party, seat: string, kind: string): Figure {
  const p = simOf(party.room).players.get(seat)!;
  const f = [...figuresOf(party.room).values()].find((g) => g.kind === kind && !g.dead)!;
  f.sceneIdx = p.sceneIdx;
  f.x = p.x;
  f.y = p.y;
  f.act = {
    kind: 'idle',
    untilTick: party.room.state.tick + 3600,
    station: null,
    goal: { scene: sceneKey(f.sceneIdx), x: f.x, y: f.y },
  };
  advance(party, 2); // the move settles (a figure takes a fresh handle once) before the test reads it
  return f;
}

/** Sends `talk.ask` and runs one tick, which is when the queue is read. */
async function sendAsk(party: Party, h: Human, payload: unknown): Promise<void> {
  await send(h, 'talk.ask', payload, 40);
  advance(party, 1);
}
const ask = (party: Party, h: Human, f: Figure, kind: 'town' | 'time') =>
  sendAsk(party, h, { targetId: f.handle, ask: kind });

describe('talk.ask', () => {
  it('answers a time ask to the asker alone, after the delay, with the figure as the speaker', async () => {
    const party = await world(2);
    const [a, b] = party.humans as [Human, Human];
    const f = figureBeside(party, a.id, 'villager');
    await ask(party, a, f, 'time');
    advance(party, DELAY - 1);
    await send(a, 'net.ping', {}, 40);
    expect(lines(a)).toHaveLength(0);
    advance(party, 2);
    await send(a, 'net.ping', {}, 60);
    const got = lines(a);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ channel: 'system', from: talk.figures.names.villager });
    expect(lines(b)).toHaveLength(0);
  });

  it('tips the ledger by drawn look and scene, never a seat, and every asker at one tick hears one line', async () => {
    const party = await world(2);
    const [a, b] = party.humans as [Human, Human];
    const p = simOf(party.room).players.get(a.id)!;
    const vicar = {
      look: 'vicar',
      sceneIdx: p.sceneIdx,
      phase: Phase.day,
      round: 1,
      tick: party.room.state.tick,
    };
    // The ledger samples as the world runs; pinning it each tick keeps the vicar the only sighting the tip can name.
    const pin = () => ledgerOf(party.room).sightings.splice(0, Infinity, vicar);
    pin();
    const f = figureBeside(party, a.id, 'villager');
    const q = simOf(party.room).players.get(b.id)!;
    q.sceneIdx = p.sceneIdx;
    q.x = p.x;
    q.y = p.y;
    await send(a, 'talk.ask', { targetId: f.handle, ask: 'town' }, 40);
    await send(b, 'talk.ask', { targetId: f.handle, ask: 'town' }, 40);
    advance(party, 1, pin); // both asks are read in one tick, so they fall due together
    advance(party, DELAY + 2, pin);
    await send(a, 'net.ping', {}, 80);
    const [la] = lines(a);
    const [lb] = lines(b);
    expect(la?.text).toContain(looks.looks.vicar!.name);
    expect(la?.text).toContain(scenes[sceneKey(p.sceneIdx)].name);
    for (const seat of party.room.state.players.values()) expect(la?.text).not.toContain(seat.id);
    expect(lb?.text).toBe(la?.text);
    // A170: the line names no seat, handle, role or card.
    const handles = [...avatarMemory(party.room).seatOf.keys()];
    for (const word of [...handles, ...Object.keys(roles.roles).filter((r) => !(r in looks.looks))])
      expect(la?.text.toLowerCase()).not.toContain(word.toLowerCase());
  });

  it('has a Constable read the latest briefing line', async () => {
    const party = await world();
    const [a] = party.humans as [Human];
    const f = figureBeside(party, a.id, 'constable');
    (briefingsOf(party.room) as { tick: number; sceneId: string; line: string }[]).push({
      tick: 1,
      sceneId: 'overworld',
      line: "Constables' briefing: footprints in the square.",
    });
    await ask(party, a, f, 'town');
    advance(party, DELAY + 2);
    await send(a, 'net.ping', {}, 80);
    expect(lines(a)[0]?.text).toContain("Constables' briefing: footprints in the square.");
  });

  it('refuses a seat, a far figure, a repeat within the cool-down, a bad ask and a ghost', async () => {
    const party = await world();
    const [a] = party.humans as [Human];
    const sim = simOf(party.room);
    const f = figureBeside(party, a.id, 'villager');
    const seatHandle = [...party.room.state.players.values()].find((s) => s.id !== a.id)!.id;
    await sendAsk(party, a, { targetId: seatHandle, ask: 'time' });
    await sendAsk(party, a, { targetId: f.handle, ask: 'weather' });
    f.x += 100_000;
    await ask(party, a, f, 'time');
    f.x -= 100_000;
    await ask(party, a, f, 'time');
    await ask(party, a, f, 'time');
    sim.players.get(a.id)!.dead = true;
    await ask(party, a, f, 'time');
    await send(a, 'net.ping', {}, 60);
    expect(reasons(a)).toEqual(['NO_TARGET', 'BAD_REQUEST', 'TOO_FAR', 'COOLDOWN', 'NOT_IN_PLAY']);
  });
});
