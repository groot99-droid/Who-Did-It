import type { ColyseusTestServer } from '@colyseus/testing';
import { TILE_PX } from '@wdi/shared';
import { BUILD_VERSION, type GameStateType } from '@wdi/shared';
import { roles, scenes } from '@wdi/content';
import { Team } from '@wdi/shared';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { simOf } from '../src/sim/RoomSim';

type Room = Awaited<ReturnType<ColyseusTestServer['sdk']['create']>>;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const opts = (name: string) => ({ name, build: BUILD_VERSION, deviceId: `dev-${name}` });

export interface Bot {
  room: Room;
  id: string;
  events: Array<{ type: string; payload: unknown }>;
}

export interface Match {
  room: PartyRoom;
  bots: Bot[];
}

export const stateOf = (bot: Bot) => bot.room.state as unknown as GameStateType;

const isConnReset = (err: unknown): boolean => {
  const e = err as { code?: string; cause?: { code?: string } } | undefined;
  return e?.code === 'ECONNRESET' || e?.cause?.code === 'ECONNRESET';
};

/**
 * Creates the leader's party. Round 8 (granted by 6Z): after a test that blocks the event loop for
 * seconds (invariants.test.ts's auto match), the server's keep-alive timer can close the idle socket
 * just as the next matchmake request reuses it, and CI saw `MatchMakeError: fetch failed` (ECONNRESET).
 * Only that connect error is retried, at most twice, with a short backoff.
 */
async function createParty(colyseus: ColyseusTestServer): Promise<Room> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await colyseus.sdk.create('party', opts('Bot0'));
    } catch (err) {
      if (attempt >= 2 || !isConnReset(err)) throw err;
      await sleep(50 * (attempt + 1));
    }
  }
}

/**
 * Creates a party of `n` bots, starts the world with the debug helper and waits until all are placed.
 * Every server message is recorded (`lastEvent`). `roles` writes a role white-box per bot name (the
 * debug start deals none): `priv.role.roleId` and `team`, so a Killer or a Detective can be tested.
 * Round 3: nobody edits this file; K's helpers live in flowHelpers.ts, L's in killHelpers.ts.
 */
export async function startMatch(
  colyseus: ColyseusTestServer,
  n: number,
  roleByName: Record<string, string> = {},
): Promise<Match> {
  const leader = await createParty(colyseus);
  const rooms = [leader];
  for (let i = 1; i < n; i++) rooms.push(await colyseus.sdk.joinById(leader.roomId, opts(`Bot${i}`)));
  const bots: Bot[] = rooms.map((room) => {
    const events: Bot['events'] = [];
    room.onMessage('*', (type: string | number | object, payload: unknown) =>
      events.push({ type: String(type), payload }),
    );
    return { room, id: room.sessionId, events };
  });
  const room = colyseus.getRoomById(leader.roomId) as unknown as PartyRoom;
  for (const [name, roleId] of Object.entries(roleByName)) {
    const i = Number(name.replace('Bot', ''));
    const priv = room.state.players.get(bots[i]?.id ?? '')?.priv;
    const role = roles.roles[roleId];
    if (!priv || !role) throw new Error(`no seat ${name} or role ${roleId}`);
    priv.role.roleId = roleId;
    priv.role.team = Team[role.faction];
  }
  leader.send('debug.play', {});
  for (let i = 0; i < 100; i++) {
    const sim = simOf(room);
    if (sim.players.size === n && [...sim.players.values()].every((p) => p.placed)) break;
    await sleep(50);
  }
  await sleep(300);
  return { room, bots };
}

/** Stands a player on a floor tile of its current scene (white-box; the wire never does this). */
export function standAt(match: Match, bot: Bot, tx: number, ty: number): void {
  const p = simOf(match.room).players.get(bot.id);
  if (!p) throw new Error('no sim');
  p.x = (tx + 0.5) * TILE_PX;
  p.y = (ty + 0.5) * TILE_PX;
  p.resetRing();
  const player = match.room.state.players.get(bot.id);
  if (player) {
    player.presence.x = Math.round(p.x);
    player.presence.y = Math.round(p.y);
  }
}

export const spawnOf = (scene: keyof typeof scenes, id: string) => {
  const s = scenes[scene].spawns.find((q) => q.id === id);
  if (!s) throw new Error(`no spawn ${scene}.${id}`);
  return s;
};

let seqs = new WeakMap<Room, number>();
export function move(bot: Bot, dx: number, dy: number, sprint = false, sneak = false): void {
  const seq = (seqs.get(bot.room) ?? 0) + 1;
  seqs.set(bot.room, seq);
  bot.room.send('input.move', { seq, dx, dy, sprint, sneak });
}
export function resetSeqs(): void {
  seqs = new WeakMap();
}

export function lastEvent(bot: Bot, type: string) {
  return [...bot.events].reverse().find((e) => e.type === type)?.payload as
    Record<string, unknown> | undefined;
}
