// Join-only bots: each joins a party by code, marks Ready and stays connected. No movement, tasks or
// reports yet (ARCHITECTURE 5.12: the swarm is a load client only).
//
//   pnpm bots -- --code ABCDE --count 6 [--url http://localhost:2567] [--prefix Bot]
import { Client, type Room } from '@colyseus/sdk';
import { BUILD_VERSION, type JoinOptions } from '@wdi/shared';
import { fileURLToPath } from 'node:url';

export interface SwarmOptions {
  code: string;
  count: number;
  url?: string;
  prefix?: string;
  /** Mark Ready in the lobby as soon as the bot has joined. Default true. */
  ready?: boolean;
}

export interface Swarm {
  rooms: Room[];
  /** Resolves once every bot has received its role card. */
  dealt: Promise<void>;
  stop(): Promise<void>;
}

export const DEFAULT_URL = 'http://localhost:2567';

export async function runSwarm(opts: SwarmOptions): Promise<Swarm> {
  const client = new Client(opts.url ?? DEFAULT_URL);
  const prefix = opts.prefix ?? 'Bot';
  const rooms: Room[] = [];
  const cards: Promise<void>[] = [];
  for (let i = 0; i < opts.count; i++) {
    const name = `${prefix}${i + 1}`;
    const options: JoinOptions = { name, build: BUILD_VERSION, deviceId: `swarm-${prefix}-${i + 1}` };
    const room = await client.joinById(opts.code.toUpperCase(), options);
    cards.push(
      new Promise<void>((resolve) => {
        room.onMessage('roleReveal', () => {
          // The card is the bot's own and is dropped at once; dismissing it counts as Ready.
          room.send('lobby.ready', { ready: true });
          resolve();
        });
      }),
    );
    room.onMessage('*', () => undefined);
    if (opts.ready !== false) room.send('lobby.ready', { ready: true });
    rooms.push(room);
  }
  return {
    rooms,
    dealt: Promise.all(cards).then(() => undefined),
    stop: async () => {
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
    throw new Error('usage: --code ABCDE --count 6 [--url URL] [--prefix Bot]');
  const count = Number(get('--count') ?? 4);
  if (!Number.isInteger(count) || count < 1 || count > 9) throw new Error('--count must be 1 to 9');
  return {
    code,
    count,
    url: get('--url') ?? process.env.SERVER_URL ?? DEFAULT_URL,
    prefix: get('--prefix') ?? 'Bot',
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
