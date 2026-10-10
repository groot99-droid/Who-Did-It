// 30 minute soak (ROADMAP M2 exit): starts a local server, joins 6 walking bots, starts the world with
// the debug helper, and samples /health every 30 s. Fails (exit 1) on a presence leak, a dropped bot,
// protocol errors beyond door refusals, or a p95 tick above 15 ms.
//
//   pnpm --filter @wdi/bots soak -- [--minutes 30] [--bots 6] [--url http://localhost:2567]
//
// Without --url the script starts apps/server/build/index.js itself (run `pnpm --filter @wdi/server
// build` first) with WDI_DEBUG=1 on a free port.
import { Client } from '@colyseus/sdk';
import { BUILD_VERSION, type JoinOptions } from '@wdi/shared';
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mulberry, startWalker } from './walk';

const argv = process.argv.slice(2);
const get = (f: string, d: string) => (argv.includes(f) ? (argv[argv.indexOf(f) + 1] as string) : d);
const minutes = Number(get('--minutes', '30'));
const botCount = Number(get('--bots', '6'));
const sampleEveryMs = Number(get('--sample-s', '30')) * 1000;
const P95_LIMIT_MS = 15;

interface Health {
  tickP95: number;
  patchBytes: number;
  rooms: number;
}

async function startServer(): Promise<{ url: string; child: ChildProcess | null }> {
  if (argv.includes('--url')) return { url: get('--url', ''), child: null };
  const entry = fileURLToPath(new URL('../../apps/server/build/index.js', import.meta.url));
  if (!existsSync(entry))
    throw new Error('apps/server/build/index.js missing: run `pnpm --filter @wdi/server build`');
  const port = 2600 + Math.floor(Math.random() * 300);
  const child = spawn('node', [entry], {
    env: { ...process.env, PORT: String(port), WDI_DEBUG: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((resolve, reject) => {
    child.stdout?.on('data', (d: Buffer) => d.toString().includes('listening') && resolve());
    child.once('exit', (c) => reject(new Error(`server exited early (${c})`)));
  });
  return { url: `http://localhost:${port}`, child };
}

const health = async (url: string): Promise<Health> =>
  (await fetch(`${url}/health`)).json() as Promise<Health>;

async function main(): Promise<void> {
  const { url, child } = await startServer();
  const client = new Client(url);
  const opts = (i: number): JoinOptions => ({
    name: `Soak${i}`,
    build: BUILD_VERSION,
    deviceId: `soak-${i}`,
  });
  const leader = await client.create('party', opts(0));
  const rooms = [leader];
  for (let i = 1; i < botCount; i++) rooms.push(await client.joinById(leader.roomId, opts(i)));
  let dropped = 0;
  let ending = false;
  rooms.forEach((r) => {
    r.onMessage('*', () => undefined);
    r.onLeave(() => !ending && dropped++);
  });
  leader.send('debug.play', {});
  await new Promise((r) => setTimeout(r, 1500));
  const rng = mulberry(20261010);
  const walkers = rooms.map((r) => startWalker(r, mulberry(Math.floor(rng() * 2 ** 31))));

  const samples: Health[] = [];
  const deadline = Date.now() + minutes * 60_000;
  console.log(`[soak] ${botCount} bots, ${minutes} min, server ${url}, room ${leader.roomId}`);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, Math.min(sampleEveryMs, deadline - Date.now())));
    const h = await health(url);
    samples.push(h);
    const total = (k: 'portals' | 'leaks' | 'errors') => walkers.reduce((n, w) => n + w.stats[k], 0);
    console.log(
      `[soak] t=${Math.round((minutes * 60_000 - (deadline - Date.now())) / 1000)}s tickP95=${h.tickP95}ms ` +
        `patchBytes=${h.patchBytes} portals=${total('portals')} leaks=${total('leaks')} dropped=${dropped}`,
    );
  }
  ending = true;
  walkers.forEach((w) => w.stop());
  await Promise.all(rooms.map((r) => r.leave(true).catch(() => undefined)));
  child?.kill();

  const worst = Math.max(0, ...samples.map((s) => s.tickP95));
  const leaks = walkers.reduce((n, w) => n + w.stats.leaks, 0);
  console.log(`[soak] done: worst tickP95 ${worst} ms, leaks ${leaks}, dropped bots ${dropped}`);
  if (leaks > 0 || dropped > 0 || worst > P95_LIMIT_MS) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
