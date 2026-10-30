import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import type { Client } from 'colyseus';
import { abilities, balance } from '@wdi/content';
import { C2S, Phase, TICK_RATE, TILE_PX, Winner } from '@wdi/shared';
import { avatarOf } from '../src/sim/Avatars';
import { applyEffect, bodyOf } from '../src/sim/body';
import { markDead } from '../src/sim/Death';
import { handleKill } from '../src/sim/Kill';
import { isGuard } from '../src/sim/law/Guards';
import { addNpcSeat } from '../src/sim/npc/seats';
import { isNpcSeat } from '../src/sim/Npc';
import { paintGameOver, returnGuards } from '../src/sim/paintTown';
import { simOf } from '../src/sim/RoomSim';
import { type Figure, figuresOf } from '../src/sim/townsfolk/figures';
import { sceneKey } from '../src/sim/World';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  pauseClock,
  placeSeat,
  setRole,
  start,
  toWorld,
} from './npcHelpers';
import { sleep } from './simHelpers';

/** Round 10, C5c (GDD 3.8, 3.24): the Knife on a guard, in every mode; in Paint The Town Red the guards come back. */

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());
vi.setConfig({ testTimeout: 60_000 });

const guardsOf = (party: Party): Figure[] => [...figuresOf(party.room).values()].filter(isGuard);

/** Stands `seat` one tile from the guard, in its scene. */
function beside(party: Party, seat: string, f: Figure): void {
  placeSeat(party, seat, sceneKey(f.sceneIdx), Math.floor(f.x / TILE_PX) + 1, Math.floor(f.y / TILE_PX));
}

const knife = (party: Party, seat: string, f: Figure) =>
  handleKill(party.room, seat, { abilityId: 'kill', targetId: f.handle });

const lastReason = (party: Party) =>
  (party.humans[0]!.log.filter((e) => e.type === 'error').at(-1)?.payload as { reason?: string } | undefined)
    ?.reason;

/** One human Killer and three NPC seats by night on HollowMere: the main mode. */
async function mainNight(): Promise<{ party: Party; human: string }> {
  const party = await lobbyOf(colyseus, 1);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  const human = party.humans[0]!.id;
  setRole(party.room, human, 'killer');
  holdPhase(party, Phase.night, 3600);
  advance(party, 1);
  return { party, human };
}

/** Two humans and four NPC seats: Paint The Town Red, by night. */
async function paintNight(): Promise<{ party: Party; killers: string[] }> {
  const party = await lobbyOf(colyseus, 2);
  pauseClock(party.room);
  for (let i = 0; i < 4; i++) addNpcSeat(party.room, party.room.seeds.get('npcNames'));
  party.room.lobbyCommands.push({ sessionId: party.humans[0]!.id } as Client, C2S.lobbyStart, {});
  advance(party, 1);
  party.room.state.phaseEndsTick = party.room.state.tick;
  for (let i = 0; i < 40; i++) advance(party, 1);
  holdPhase(party, Phase.night, 3600);
  advance(party, 1);
  return { party, killers: party.humans.map((h) => h.id) };
}

describe('the Knife on a guard (GDD 3.24)', () => {
  it('kills a guard in reach in the main mode: a body, blood, the cooldown, and it stays dead', async () => {
    const { party, human } = await mainNight();
    const room = party.room;
    const f = guardsOf(party)[0]!;
    const handle = f.handle!;
    beside(party, human, f);
    knife(party, human, f);
    expect(f.dead).toBe(true);
    expect(avatarOf(room, handle)).toBeUndefined();
    expect(room.state.scenes.get(sceneKey(f.sceneIdx))!.bodies.has(`body_${f.id}`)).toBe(true);
    const actor = simOf(room).players.get(human)!;
    expect(actor.bloodyUntilTick).toBeGreaterThan(room.state.tick);
    expect(room.state.players.get(human)!.priv.cooldownEndTick.get('kill')).toBeGreaterThan(room.state.tick);
    returnGuards(room, room.state.round + 5); // no Paint mode: nothing returns
    expect(f.dead).toBe(true);
  });

  it('takes a knocked-out guard; refuses one out of reach and one on the cooldown', async () => {
    const { party, human } = await mainNight();
    const room = party.room;
    const [a, b] = guardsOf(party) as [Figure, Figure];
    const body = bodyOf(room, a.id)!;
    applyEffect(room, a.id, body, 'knockedOut');
    placeSeat(
      party,
      human,
      sceneKey(a.sceneIdx),
      Math.floor(a.x / TILE_PX) + Math.ceil(abilities.abilities.kill!.rangeTiles ?? 1) + 3,
      Math.floor(a.y / TILE_PX),
    );
    knife(party, human, a);
    await sleep(150);
    expect(lastReason(party)).toBe('TOO_FAR');
    beside(party, human, a);
    knife(party, human, a);
    expect(a.dead).toBe(true);
    beside(party, human, b);
    knife(party, human, b);
    await sleep(150);
    expect(lastReason(party)).toBe('COOLDOWN');
    expect(b.dead).toBe(false);
  });
});

describe('the guards in Paint The Town Red (GDD 3.8)', () => {
  it('returns a knifed guard on the next morning’s train, never the same round; it counts toward no total', async () => {
    const { party, killers } = await paintNight();
    const room = party.room;
    const f = guardsOf(party)[0]!;
    beside(party, killers[0]!, f);
    knife(party, killers[0]!, f);
    expect(f.dead).toBe(true);
    returnGuards(room, room.state.round);
    expect(f.dead).toBe(true);
    returnGuards(room, room.state.round + 1);
    expect(f.dead).toBe(false);
    expect(avatarOf(room, f.handle!)).toBeDefined();
    expect(bodyOf(room, f.id)!.hp).toBe(bodyOf(room, f.id)!.maxHp);
    for (const scene of room.state.scenes.values()) expect(scene.bodies.has(`body_${f.id}`)).toBe(false);
    expect(paintGameOver(room)!.killers.every((k) => k.unique === 0 && k.total === 0)).toBe(true);
  });

  it('brings the guard back when the next day’s train arrives', async () => {
    const { party, killers } = await paintNight();
    const room = party.room;
    const f = guardsOf(party)[0]!;
    beside(party, killers[0]!, f);
    knife(party, killers[0]!, f);
    expect(f.dead).toBe(true);
    // The next day, its clock just past the arrival.
    room.state.round++;
    holdPhase(party, Phase.day, balance.phases.dayS - balance.train.arriveAtS - 1 / TICK_RATE);
    advance(party, 3);
    expect(f.dead).toBe(false);
  });

  it('wins at the tick the last pillar falls to the Knife', async () => {
    const { party, killers } = await paintNight();
    const room = party.room;
    const sim = simOf(room);
    const vicar = [...room.state.players.keys()].find(
      (id) => isNpcSeat(room, id) && room.state.players.get(id)!.priv.role.roleId === 'vicar',
    )!;
    markDead(room, vicar, 'wolf');
    const guards = guardsOf(party);
    for (const g of guards.slice(1)) {
      sim.players.get(killers[0]!)!.busyUntilTick = 0;
      room.state.players.get(killers[0]!)!.priv.cooldownEndTick.set('kill', 0);
      beside(party, killers[0]!, g);
      knife(party, killers[0]!, g);
      expect(g.dead).toBe(true);
    }
    expect(room.state.winner).not.toBe(Winner.paintTown);
    room.state.players.get(killers[1]!)!.priv.cooldownEndTick.set('kill', 0);
    beside(party, killers[1]!, guards[0]!);
    knife(party, killers[1]!, guards[0]!);
    expect(room.state.winner).toBe(Winner.paintTown);
  });
});
