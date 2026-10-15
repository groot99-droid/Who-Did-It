// Random-walk movement bots (ARCHITECTURE 5.12: load clients only, no tasks or reports). Each bot walks
// in a random direction for a second or two, sometimes runs, sometimes stands, and when it stands next
// to a door it sometimes walks through it.
//
//   pnpm --filter @wdi/bots walk -- --code ABCDE --count 6 [--url http://localhost:2567]
//
// The server must run with WDI_DEBUG=1 for `--play` (the debug.play start used by the soak); against a
// real lobby the bots just join and walk once the match starts.
import { Client, type Room } from '@colyseus/sdk';
import { scenes } from '@wdi/content';
import { BUILD_VERSION, DIRECTIONS, type JoinOptions, TICK_RATE, TILE_PX } from '@wdi/shared';
import { fileURLToPath } from 'node:url';

export const DEFAULT_URL = 'http://localhost:2567';
const SCENE_IDS = Object.keys(scenes) as Array<keyof typeof scenes>;
/** Scene ids by `Player.sceneId` index; same order as @wdi/content. */
const REACH_PX = 1.5 * TILE_PX;

export interface WalkerStats {
  ticksSent: number;
  portals: number;
  errors: number;
  /** Players seen with a presence in a scene other than the bot's own, outside a transit. Must stay 0. */
  leaks: number;
}

interface PlayerLike {
  id: string;
  sceneId: number;
  presence?: { x: number; y: number; statusBits: number };
}
interface StateLike {
  players: {
    forEach(cb: (p: PlayerLike, id: string) => void): void;
    get(id: string): PlayerLike | undefined;
  };
}

/** Deterministic PRNG so a soak run can be reproduced from its seed. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DIR_VECTORS = DIRECTIONS.map((_, i) => {
  const a = (i * Math.PI) / 4;
  // `+ 0` turns a -0 into 0.
  return { dx: Math.round(Math.sin(a) * 1000) / 1000 + 0, dy: Math.round(-Math.cos(a) * 1000) / 1000 + 0 };
});

export function startWalker(room: Room, rng: () => number): { stats: WalkerStats; stop(): void } {
  const stats: WalkerStats = { ticksSent: 0, portals: 0, errors: 0, leaks: 0 };
  let seq = 0;
  let dir = DIR_VECTORS[Math.floor(rng() * 8)]!;
  let moving = true;
  let sprint = false;
  let decideAt = 0;
  room.onMessage('error', () => stats.errors++);
  room.onMessage('sceneEnter', () => undefined);
  room.onMessage('noise', () => undefined);

  const timer = setInterval(() => {
    const state = room.state as unknown as StateLike | undefined;
    const me = state?.players.get(room.sessionId);
    if (!state || !me?.presence) return;
    const now = Date.now();
    if (now >= decideAt) {
      decideAt = now + 1000 + rng() * 2000;
      dir = DIR_VECTORS[Math.floor(rng() * 8)]!;
      moving = rng() > 0.2;
      sprint = rng() < 0.3;
      const scene = scenes[SCENE_IDS[me.sceneId] ?? 'overworld'];
      if (rng() < 0.25) {
        // Head for the nearest door now and then so a soak crosses portals often.
        let best = Infinity;
        for (const p of scene.portals) {
          const vx = (p.x + 0.5) * TILE_PX - me.presence.x;
          const vy = (p.y + 0.5) * TILE_PX - me.presence.y;
          const d = Math.hypot(vx, vy);
          if (d < best && d > 1) {
            best = d;
            dir = { dx: vx / d, dy: vy / d };
          }
        }
        moving = true;
      }
      const door = scene.portals.find(
        (p) =>
          Math.hypot(me.presence!.x - (p.x + 0.5) * TILE_PX, me.presence!.y - (p.y + 0.5) * TILE_PX) <=
          REACH_PX,
      );
      if (door && rng() < 0.4) {
        room.send('act.enterPortal', { portalId: door.id });
        stats.portals++;
      }
    }
    room.send('input.move', {
      seq: ++seq,
      dx: moving ? dir.dx : 0,
      dy: moving ? dir.dy : 0,
      sprint,
      sneak: false,
    });
    stats.ticksSent++;
    // Leak monitor: a presence outside my scene is only legitimate during that player's transit.
    state.players.forEach((p, id) => {
      if (
        id !== room.sessionId &&
        p.presence &&
        p.sceneId !== me.sceneId &&
        (p.presence.statusBits & 1) === 0
      )
        stats.leaks++;
    });
  }, 1000 / TICK_RATE);
  return { stats, stop: () => clearInterval(timer) };
}

export interface WalkOptions {
  code: string;
  count: number;
  url?: string;
  prefix?: string;
  seed?: number;
}

export async function joinWalkers(opts: WalkOptions) {
  const client = new Client(opts.url ?? DEFAULT_URL);
  const rooms: Room[] = [];
  const walkers: Array<ReturnType<typeof startWalker>> = [];
  const rng = mulberry(opts.seed ?? 1);
  for (let i = 0; i < opts.count; i++) {
    const options: JoinOptions = {
      name: `${opts.prefix ?? 'Walk'}${i + 1}`,
      build: BUILD_VERSION,
      deviceId: `walk-${opts.prefix ?? 'Walk'}-${i + 1}`,
    };
    const room = await client.joinById(opts.code.toUpperCase(), options);
    room.onMessage('*', () => undefined);
    rooms.push(room);
    walkers.push(startWalker(room, mulberry(Math.floor(rng() * 2 ** 31))));
  }
  return {
    rooms,
    walkers,
    stop: async () => {
      walkers.forEach((w) => w.stop());
      await Promise.all(rooms.map((r) => r.leave(true).catch(() => undefined)));
    },
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (f: string) => argv[argv.indexOf(f) + 1];
  const code = get('--code');
  if (!code) throw new Error('usage: walk --code ABCDE [--count 6] [--url http://localhost:2567]');
  void joinWalkers({
    code,
    count: Number(get('--count') ?? 6),
    ...(get('--url') ? { url: get('--url') as string } : {}),
  }).then((swarm) => {
    console.log(`[walk] ${swarm.rooms.length} bots walking; Ctrl+C to stop`);
    process.on('SIGINT', () => void swarm.stop().then(() => process.exit(0)));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
