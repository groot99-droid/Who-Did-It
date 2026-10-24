import type { Client, StepContext } from '@colyseus/core';
import type { ColyseusTestServer } from '@colyseus/testing';
import { boot } from '@colyseus/testing';
import { type SceneId, roles } from '@wdi/content';
import {
  BUILD_VERSION,
  C2S,
  Phase,
  TICK_RATE,
  TILE_PX,
  Team,
  type GameStateType,
  type PlayerState,
} from '@wdi/shared';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { runLobbyCommands, runLobbyPhase } from '../src/rooms/handlers/lobby';
import { createServer } from '../src/server';
import { isNpcSeat } from '../src/sim/Npc';
import { addNpcSeat } from '../src/sim/npc/seats';
import { simOf } from '../src/sim/RoomSim';
import { step } from '../src/sim/Step';
import { sceneIndex } from '../src/sim/World';
import { until } from './flowHelpers';
import { fixSeeds } from './seedHelpers';
import { sleep } from './simHelpers';

type Room = Awaited<ReturnType<ColyseusTestServer['sdk']['create']>>;

export interface Human {
  room: Room;
  id: string;
  log: { type: string; payload: unknown }[];
}

export interface Party {
  humans: Human[];
  room: PartyRoom;
}

const opts = (name: string) => ({ name, build: BUILD_VERSION, deviceId: `dev-${name}` });

/** Boots a test server with the debug handlers on. */
export async function bootNpcServer(): Promise<{
  colyseus: ColyseusTestServer;
  release: () => Promise<void>;
}> {
  process.env.WDI_DEBUG = '1';
  const colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
  return {
    colyseus,
    release: async () => {
      delete process.env.WDI_DEBUG;
      await colyseus.shutdown();
    },
  };
}

const isReset = (err: unknown): boolean => {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  return e?.code === 'ECONNRESET' || e?.cause?.code === 'ECONNRESET';
};

/** One retry on a reset matchmake request, nothing else (CI runners drop the odd socket). */
async function connect(join: () => Promise<Room>): Promise<Human> {
  let room: Room;
  try {
    room = await join();
  } catch (err) {
    if (!isReset(err)) throw err;
    await sleep(100);
    room = await join();
  }
  const human: Human = { room, id: room.sessionId, log: [] };
  room.onMessage('*', (type: string | number, payload: unknown) =>
    human.log.push({ type: String(type), payload }),
  );
  return human;
}

/** A lobby with `n` human bots (Bot0 leads). */
export async function lobbyOf(colyseus: ColyseusTestServer, n: number): Promise<Party> {
  const leader = await connect(() => colyseus.sdk.create('party', opts('Bot0')));
  const humans = [leader];
  for (let i = 1; i < n; i++) {
    humans.push(await connect(() => colyseus.sdk.joinById(leader.room.roomId, opts(`Bot${i}`))));
  }
  await sleep(150);
  return { humans, room: colyseus.getRoomById(leader.room.roomId) as unknown as PartyRoom };
}

export const join = (colyseus: ColyseusTestServer, party: Party, name: string): Promise<Human> =>
  connect(() => colyseus.sdk.joinById(party.room.roomId, opts(name)));

export const stateOf = (h: Human) => h.room.state as unknown as GameStateType;

/** Sends one message and waits for a few steps to consume it. */
export async function send(h: Human, type: string, payload: unknown = {}, ms = 150): Promise<void> {
  h.room.send(type, payload);
  await sleep(ms);
}

export const errors = (h: Human): number[] =>
  h.log.filter((m) => m.type === 'error').map((m) => (m.payload as { code: number }).code);

export const npcSeats = (room: PartyRoom): PlayerState[] =>
  [...room.state.players.entries()].filter(([id]) => isNpcSeat(room, id)).map(([, p]) => p);

/** Presses Start as the leader and waits for the role card. */
export async function start(party: Party): Promise<void> {
  party.humans[0]?.room.send(C2S.lobbyStart, {});
  await until(() => party.room.state.phase === Phase.roleReveal);
}

/** Ends the role card at once and waits for the first world phase and every placement. */
export async function toWorld(party: Party): Promise<void> {
  party.room.state.phaseEndsTick = party.room.state.tick;
  await until(() => party.room.state.phase === Phase.grace);
  const sim = simOf(party.room);
  await until(() => sim.players.size > 0 && [...sim.players.values()].every((p) => p.placed));
}

/** White-box: every seat becomes a plain Townsfolk, so no role gets in the way of a movement test. */
export function allTownsfolk(room: PartyRoom): void {
  for (const p of room.state.players.values()) {
    p.priv.role.roleId = 'townsfolk';
    p.priv.role.team = Team[roles.roles.townsfolk?.faction ?? 'village'];
  }
}

/** White-box: gives one seat a role. */
export function setRole(room: PartyRoom, id: string, roleId: string): void {
  const p = room.state.players.get(id);
  const role = roles.roles[roleId];
  if (!p || !role) throw new Error(`no seat ${id} or role ${roleId}`);
  p.priv.role.roleId = roleId;
  p.priv.role.team = Team[role.faction];
}

/** White-box: stands a seat on a tile of a scene (sim and roster agree) and refreshes the views. */
export function placeSeat(party: Party, id: string, sceneId: SceneId, tx: number, ty: number): void {
  const sim = simOf(party.room);
  const p = sim.players.get(id);
  const player = party.room.state.players.get(id);
  if (!p || !player) throw new Error(`no seat ${id}`);
  p.sceneIdx = sceneIndex(sceneId);
  player.priv.sceneId = p.sceneIdx;
  p.x = (tx + 0.5) * TILE_PX;
  p.y = (ty + 0.5) * TILE_PX;
  p.input = null;
  p.resetRing();
  player.presence.x = Math.round(p.x);
  player.presence.y = Math.round(p.y);
  sim.viewsDirty = true;
}

/** The room's own fixed step (`PartyRoom.setFixedTimestep`), without the clock. */
function fixedStep(room: PartyRoom, ctx: StepContext): void {
  step(room, ctx);
  runLobbyCommands(room);
  runLobbyPhase(room);
}

/**
 * Runs `ticks` server steps synchronously (no sleeps), calling `onTick` after each: `fixedStep` without the clock,
 * so a test covers minutes of play in milliseconds.
 */
export function advance(party: Party, ticks: number, onTick?: (tick: number) => void): void {
  const ctx = {} as StepContext;
  for (let i = 0; i < ticks; i++) {
    fixedStep(party.room, ctx);
    onTick?.(party.room.state.tick);
  }
}

/**
 * Takes the room off its clock: it then steps only through `advance`, so the tick a test reads depends on the steps
 * it ran and never on wall time (the clock keeps stepping while a test awaits). `resumeClock` puts `fixedStep` back
 * on the room's own clock.
 */
export function pauseClock(room: PartyRoom): void {
  room.setTimestep();
}

export function resumeClock(room: PartyRoom): void {
  room.setFixedTimestep((ctx) => fixedStep(room, ctx), TICK_RATE);
}

/** White-box: puts the room in `phase` until `seconds` from now. */
export function holdPhase(party: Party, phase: number, seconds: number): void {
  party.room.state.phase = phase;
  party.room.state.phaseEndsTick = party.room.state.tick + Math.round(seconds * TICK_RATE);
}

/** The four fixed seed sets of the NPC tests (npc.md part 2, section 1). */
export type SeedSet = 'S1' | 'S2' | 'S3' | 'S4';
export const SEED_SETS: Record<SeedSet, readonly [number, number, number, number]> = {
  S1: [0x2f6b1a3d, 0x91c4e7f2, 0x5ad38e01, 0xc7709b44],
  S2: [0x13579bdf, 0x2468ace0, 0xfdb97531, 0x0eca8642],
  S3: [0xdeadbeef, 0x0badf00d, 0xfeedface, 0xcafebabe],
  S4: [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a],
};

/** The nine NPC seat ids of a seed set: `s1npc0001` to `s1npc0009`. */
export const npcIdsOf = (set: SeedSet): string[] =>
  Array.from({ length: 9 }, (_, i) => `${set.toLowerCase()}npc000${i + 1}`);

/** The tick a standard party's lobby is advanced to before Start, whatever the lobby took in wall time. */
const STANDARD_START_TICK = 5 * TICK_RATE;

/**
 * A 1 human + 9 NPC party at the large profile, seeds and NPC seat ids fixed to `set`; stops on the role card when
 * `onCard`, else in its first world phase. The human never sends input, never readies and never votes.
 *
 * From the lobby on the party runs on the test's own steps, not the room's clock: Start is queued and consumed on
 * a fixed tick, the card is cut, and grace and every placement follow on the ticks after. So every run of a set has
 * the same tick timeline, every brain timer is set on the same tick, and two runs compared tick for tick (R18, M7)
 * line up whatever the load. The clock is back on the room when the party is returned.
 */
export async function standardParty(
  colyseus: ColyseusTestServer,
  set: SeedSet,
  onCard = false,
): Promise<Party> {
  const party = await lobbyOf(colyseus, 1);
  pauseClock(party.room);
  const lobbyTicks = party.room.state.tick;
  if (lobbyTicks > STANDARD_START_TICK) throw new Error(`standardParty: the lobby took ${lobbyTicks} ticks`);
  advance(party, STANDARD_START_TICK - lobbyTicks);
  const words = SEED_SETS[set];
  // Every stream a day of play can draw from, so two runs of a set are the same day (the node pool and the creatures
  // are drawn from `nodes` and `mobs`; the rest keep crypto words).
  fixSeeds(party.room, {
    deal: words,
    npcTiming: words,
    npcPlay: words,
    traits: words,
    nodes: words,
    mobs: words,
    minigame: words,
    contract: words,
    vendetta: words,
    events: words,
  });
  for (const id of npcIdsOf(set)) addNpcSeat(party.room, party.room.seeds.get('npcNames'), id);
  party.room.lobbyCommands.push({ sessionId: party.humans[0]!.id } as Client, C2S.lobbyStart, {});
  advance(party, 1);
  if (party.room.state.phase !== Phase.roleReveal) throw new Error('standardParty: Start was refused');
  if (!onCard) {
    party.room.state.phaseEndsTick = party.room.state.tick;
    advance(party, 1);
    const sim = simOf(party.room);
    const placed = () => sim.players.size > 0 && [...sim.players.values()].every((p) => p.placed);
    for (let i = 0; i < TICK_RATE && !placed(); i++) advance(party, 1);
    if (!placed()) throw new Error('standardParty: not every seat was placed within a second of grace');
  }
  resumeClock(party.room);
  return party;
}
