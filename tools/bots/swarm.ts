// Lobby bots: each joins a party by code, marks Ready and stays connected. By default a bot stands on its
// spawn and votes Skip; `walk`, `vote` and `report` (tools/bots/walk.ts) make it act in a match, which is
// what the Playwright match spec and the soak drive (ARCHITECTURE 5.12).
//
//   pnpm bots -- --code ABCDE --count 6 [--url http://localhost:2567] [--prefix Bot]
//        [--vote skip|leader|random|other|<name>] [--report] [--walk]
import { Client, type Room } from '@colyseus/sdk';
import { BUILD_VERSION, type JoinOptions } from '@wdi/shared';
import { fileURLToPath } from 'node:url';
import { type BotBehavior, mulberry, startWalker } from './walk';

export interface SwarmOptions extends BotBehavior {
  code: string;
  count: number;
  url?: string;
  prefix?: string;
  /** Mark Ready in the lobby as soon as the bot has joined. Default true. */
  ready?: boolean;
  /** Seed of the bots' random choices. Default 1. */
  seed?: number;
}

/** The party settings as a bot sees them (`state.settings`), read-only. */
export interface SwarmSettings {
  readonly mode: number;
  readonly npcDifficulty: number;
  readonly npcSeats: number;
}

export interface Swarm {
  rooms: Room[];
  bots: Array<ReturnType<typeof startWalker>>;
  /** Resolves once every bot has received its role card. */
  dealt: Promise<void>;
  /** The party settings read from the first bot's synced state (a snapshot per access). */
  readonly settings: SwarmSettings;
  /** Sends `lobby.addNpc` from the first bot; the server accepts it from the party leader only. */
  addNpc(): void;
  /** Sends `lobby.removeNpc` from the first bot (the leader only; it drops the newest NPC seat). */
  removeNpc(): void;
  stop(): Promise<void>;
}

export const DEFAULT_URL = 'http://localhost:2567';

export async function runSwarm(opts: SwarmOptions): Promise<Swarm> {
  const client = new Client(opts.url ?? DEFAULT_URL);
  const prefix = opts.prefix ?? 'Bot';
  const rooms: Room[] = [];
  const cards: Promise<unknown>[] = [];
  const bots: Array<ReturnType<typeof startWalker>> = [];
  const rng = mulberry(opts.seed ?? 1);
  // Today's swarm stands still; ask for `walk: true` to roam.
  const behavior: BotBehavior = { ...opts, walk: opts.walk ?? false };
  for (let i = 0; i < opts.count; i++) {
    const name = `${prefix}${i + 1}`;
    const options: JoinOptions = { name, build: BUILD_VERSION, deviceId: `swarm-${prefix}-${i + 1}` };
    const room = await client.joinById(opts.code.toUpperCase(), options);
    room.onMessage('*', () => undefined);
    const bot = startWalker(room, mulberry(Math.floor(rng() * 2 ** 31)), behavior);
    bots.push(bot);
    cards.push(bot.card);
    if (opts.ready !== false) room.send('lobby.ready', { ready: true });
    rooms.push(room);
  }
  const observer = rooms[0];
  return {
    rooms,
    bots,
    dealt: Promise.all(cards).then(() => undefined),
    get settings(): SwarmSettings {
      const st = (observer?.state as unknown as { settings?: SwarmSettings } | undefined)?.settings;
      return { mode: st?.mode ?? 0, npcDifficulty: st?.npcDifficulty ?? 0, npcSeats: st?.npcSeats ?? 0 };
    },
    addNpc: () => observer?.send('lobby.addNpc', {}),
    removeNpc: () => observer?.send('lobby.removeNpc', {}),
    stop: async () => {
      bots.forEach((b) => b.stop());
      await Promise.all(rooms.map((r) => r.leave(true).catch(() => undefined)));
    },
  };
}

export function parseArgs(argv: string[]): SwarmOptions {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const code = get('--code');
  if (!code || !/^[A-Za-z0-9]{5}$/.test(code))
    throw new Error(
      'usage: --code ABCDE --count 6 [--url URL] [--prefix Bot] [--vote V] [--report] [--walk]',
    );
  const count = Number(get('--count') ?? 4);
  if (!Number.isInteger(count) || count < 1 || count > 9) throw new Error('--count must be 1 to 9');
  return {
    code,
    count,
    url: get('--url') ?? process.env.SERVER_URL ?? DEFAULT_URL,
    prefix: get('--prefix') ?? 'Bot',
    vote: get('--vote') ?? 'skip',
    report: argv.includes('--report'),
    walk: argv.includes('--walk'),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const opts = parseArgs(process.argv.slice(2));
  const swarm = await runSwarm(opts);
  console.log(`[bots] ${swarm.rooms.length} bots joined ${opts.code.toUpperCase()}; Ctrl+C to leave`);
  const quit = () => void swarm.stop().then(() => process.exit(0));
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}
