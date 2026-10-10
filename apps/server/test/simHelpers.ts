import type { ColyseusTestServer } from '@colyseus/testing';
import { TILE_PX } from '@wdi/shared';
import { BUILD_VERSION, type GameStateType } from '@wdi/shared';
import { scenes } from '@wdi/content';
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

/** Creates a party of `n` bots, starts the world with the debug helper and waits until all are placed. */
export async function startMatch(colyseus: ColyseusTestServer, n: number): Promise<Match> {
  const leader = await colyseus.sdk.create('party', opts('Bot0'));
  const rooms = [leader];
  for (let i = 1; i < n; i++) rooms.push(await colyseus.sdk.joinById(leader.roomId, opts(`Bot${i}`)));
  const bots: Bot[] = rooms.map((room) => {
    const events: Bot['events'] = [];
    for (const type of ['sceneEnter', 'noise', 'error']) {
      room.onMessage(type, (payload: unknown) => events.push({ type, payload }));
    }
    return { room, id: room.sessionId, events };
  });
  const room = colyseus.getRoomById(leader.roomId) as unknown as PartyRoom;
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
