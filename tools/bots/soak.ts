// 30 minute soak (ROADMAP M2 and M3 exit): starts a local server, joins 6 walking bots and plays matches
// back to back so bodies, clues and meetings exist throughout. The leader bot fixes the deal with
// `debug.deal` (one Killer, rotating) and sends `lobby.start`; every bot readies on its role card; when
// a match ends and the room returns to the lobby the next one starts. Samples /health every 30 s. Fails
// (exit 1) on a presence leak, a dropped bot, a protocol error beyond refusals, or a p95 tick above 15 ms.
//
// `--mode onub` plays quick mode instead (GDD 3.11): the leader bot sets the mode through `lobby.settings`,
// the deal is the server's (no `debug.deal`), every bot plays prep, its window, one claim and the vote
// (quick.ts), and the run fails on a night leak (a sleeper that received `nightWake` or `nightReveal`, or anyone
// that received a presence), or when no prep, no wake or no meeting ever happened. `--sizes 4,6,8` cycles the
// party size by having the leader add NPC seats on top of the `--bots` humans (at least `--bots` each), and the
// run ends with the ruin rate per size against the 20-30% target. `--sabotage 0.6` is the chance a sabotaging
// bot plays a sabotage card (1 is the all-in human of onub-contract.md 11); `--pace fast` squeezes the bots' timing.
//
//   pnpm --filter @wdi/bots soak -- [--minutes 30] [--bots 6] [--mode main|onub] [--url http://localhost:2567]
//        [--sizes 4,6,8] [--sabotage 0.6] [--pace human|fast]
//
// Without --url the script starts apps/server/build/index.js itself (run `pnpm --filter @wdi/server
// build` first) with WDI_DEBUG=1 on a free port. With --url the server must run with WDI_DEBUG=1.
import { Client, type Room } from '@colyseus/sdk';
import { onubBalance } from '@wdi/content';
import { BUILD_VERSION, GameMode, type JoinOptions, MAX_PLAYERS, Phase } from '@wdi/shared';
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type RuinSample, ruinReport, ruinSample } from './quick';
import { type Bot, mulberry, startWalker } from './walk';

const argv = process.argv.slice(2);
const get = (f: string, d: string) => (argv.includes(f) ? (argv[argv.indexOf(f) + 1] as string) : d);
const minutes = Number(get('--minutes', '30'));
const botCount = Number(get('--bots', '6'));
const mode = get('--mode', 'main');
if (mode !== 'main' && mode !== 'onub') throw new Error('--mode must be main or onub');
const quick = mode === 'onub';
const sizes = get('--sizes', '').split(',').filter(Boolean).map(Number);
if (sizes.some((n) => !Number.isInteger(n) || n < botCount || n > MAX_PLAYERS))
  throw new Error(`--sizes must be integers from --bots (${botCount}) to ${MAX_PLAYERS}`);
const paceArg = get('--pace', 'human');
if (paceArg !== 'human' && paceArg !== 'fast') throw new Error('--pace must be human or fast');
const pace = paceArg;
const sabotage = Number(get('--sabotage', String(onubBalance.npc.sabotageChance.normal)));
const sampleEveryMs = Number(get('--sample-s', '30')) * 1000;
const P95_LIMIT_MS = 15;
/** A soak this long must have seen play: at least one kill and one meeting. */
const EXERCISE_AFTER_MIN = 5;

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const phaseOf = (room: Room) => (room.state as unknown as { phase: number }).phase;

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
  // Every bot walks, reports what it finds, votes at random and strikes when its card holds the Knife; in
  // quick mode it votes for another seat.
  const rng = mulberry(20261010);
  const walkers: Bot[] = rooms.map((r) =>
    startWalker(r, mulberry(Math.floor(rng() * 2 ** 31)), {
      walk: true,
      report: true,
      killer: true,
      vote: quick ? 'other' : 'random',
      quick: { sabotage, pace },
    }),
  );

  let matches = 0;
  let starting = false;
  const ruinSamples: RuinSample[] = [];
  leader.onMessage('gameOver', (m: { onub?: { dealt: Record<string, string>; ruined: boolean } }) => {
    if (quick && m.onub) ruinSamples.push(ruinSample(m.onub));
  });
  /** Quick mode: seats NPCs on top of the humans until the party is the next size of `--sizes`. */
  const sizeParty = async () => {
    if (!quick || sizes.length === 0) return;
    const want = (sizes[matches % sizes.length] as number) - botCount;
    const npcs = () => (leader.state as unknown as { settings: { npcSeats: number } }).settings.npcSeats;
    for (let i = 0; i < 20 && npcs() !== want; i++) {
      leader.send(npcs() < want ? 'lobby.addNpc' : 'lobby.removeNpc', {});
      await sleep(150);
    }
  };
  /** Deal the Killer to the next seat (quick mode: the server deals) and start; the bots ready on their cards. */
  const startMatch = async () => {
    starting = true;
    if (quick) {
      // The mode persists through the lobby reset; asking again is cheap and settles a late patch.
      leader.send('lobby.settings', { mode: GameMode.onub });
      await sleep(250);
      await sizeParty();
    } else {
      leader.send('debug.deal', { roles: { [rooms[matches % rooms.length]!.sessionId]: 'killer' } });
      await sleep(250);
    }
    leader.send('lobby.start', {});
    for (let i = 0; i < 50 && phaseOf(leader) === Phase.lobby; i++) await sleep(100);
    if (phaseOf(leader) !== Phase.lobby) matches++;
    starting = false;
  };

  const samples: Health[] = [];
  const deadline = Date.now() + minutes * 60_000;
  let nextSample = Date.now() + sampleEveryMs;
  console.log(`[soak] ${mode} mode, ${botCount} bots, ${minutes} min, server ${url}, room ${leader.roomId}`);
  const total = (k: Exclude<keyof Bot['stats'], 'meetings'>) => walkers.reduce((n, w) => n + w.stats[k], 0);
  // Meetings are counted once per bot; the leader sees every one.
  const meetings = () => walkers[0]!.stats.meetings;
  while (Date.now() < deadline) {
    if (!starting && phaseOf(leader) === Phase.lobby) await startMatch();
    await sleep(500);
    if (Date.now() < nextSample) continue;
    nextSample = Date.now() + sampleEveryMs;
    const h = await health(url);
    samples.push(h);
    console.log(
      `[soak] t=${Math.round((minutes * 60_000 - (deadline - Date.now())) / 1000)}s tickP95=${h.tickP95}ms ` +
        `patchBytes=${h.patchBytes} matches=${matches} kills=${total('kills')} reports=${total('reports')} ` +
        `meetings=${meetings()} portals=${total('portals')} leaks=${total('leaks')} ` +
        (quick
          ? `preps=${total('preps')} wakes=${total('wakes')} acts=${total('acts')} claims=${total('claims')} nightLeaks=${total('nightLeaks')} `
          : '') +
        `refusals=${total('errors')} protocolErrors=${total('protocolErrors')} dropped=${dropped}`,
    );
  }
  ending = true;
  walkers.forEach((w) => w.stop());
  await Promise.all(rooms.map((r) => r.leave(true).catch(() => undefined)));
  child?.kill();

  const worst = Math.max(0, ...samples.map((s) => s.tickP95));
  const leaks = total('leaks') + total('nightLeaks');
  const protocolErrors = total('protocolErrors');
  // A long run must have played: a kill and a meeting in the main mode, a meeting in quick.
  const idle =
    minutes >= EXERCISE_AFTER_MIN &&
    (quick
      ? meetings() === 0 || total('preps') === 0 || total('wakes') === 0
      : total('kills') === 0 || meetings() === 0);
  console.log(
    `[soak] done (${mode}): worst tickP95 ${worst} ms, leaks ${leaks}, protocol errors ${protocolErrors}, ` +
      `dropped bots ${dropped}, matches ${matches}, meetings ${meetings()}` +
      (quick
        ? `, preps ${total('preps')}, wakes ${total('wakes')}, acts ${total('acts')}, claims ${total('claims')}`
        : `, kills ${total('kills')}`),
  );
  if (quick && ruinSamples.length)
    console.log(
      ruinReport(ruinSamples)
        .map((l) => `[soak] ${l}`)
        .join('\n'),
    );
  if (idle)
    console.error(
      `[soak] the match loop never ran: ${quick ? 'no prep, no wake or no meeting' : 'no kill or no meeting'} happened`,
    );
  if (leaks > 0 || dropped > 0 || protocolErrors > 0 || worst > P95_LIMIT_MS || idle) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
