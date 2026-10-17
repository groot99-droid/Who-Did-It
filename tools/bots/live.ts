// Smokes a live server from the outside (docs/PLAYTESTS/README.md 1, the solo smoke run): reads
// /health, creates a party with the server's own build id, joins bots by the party code, marks them
// Ready, starts the match from the leader, and expects every seat's role card and the overworld
// sceneEnter. Exits 1 on any failure, so it can gate a playtest.
//
// `--mode onub` plays quick mode through the role cards and into dusk: the leader sets the mode, and every
// seat must get its card, the bakery sceneEnter and the dusk phase (GDD 3.11).
//
//   pnpm bots:live -- --url https://who-did-it-production.up.railway.app [--count 5] [--timeout 30]
//        [--mode main|onub]
import { Client, type Room } from '@colyseus/sdk';
import { GameMode, type JoinOptions, Phase } from '@wdi/shared';
import { fileURLToPath } from 'node:url';

export interface LiveOptions {
  url: string;
  count: number;
  timeoutS: number;
  mode: 'main' | 'onub';
}

export interface LiveResult {
  build: string;
  code: string;
  seats: number;
  cards: number;
  /** Seats that entered the first scene of the mode: the overworld, or the bakery in quick mode. */
  entered: number;
  /** Quick mode: seats that saw the dusk phase. Equals `seats` when the run is complete; 0 otherwise. */
  dusk: number;
  errors: string[];
}

interface Seat {
  room: Room;
  card: Promise<void>;
  entered: Promise<string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stateOf = (room: Room) => room.state as unknown as { phase: number; settings: { mode: number } };

const withTimeout = <T>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s waiting for ${what}`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });

function seat(room: Room, errors: string[]): Seat {
  const card = new Promise<void>((resolve) => {
    room.onMessage('roleReveal', () => {
      // Dismissing the card counts as Ready, as the browser client does.
      room.send('lobby.ready', { ready: true });
      resolve();
    });
  });
  const entered = new Promise<string>((resolve) => {
    room.onMessage('sceneEnter', (m: { sceneId: string }) => resolve(m.sceneId));
  });
  room.onMessage('error', (e: { code: number; msg: string }) =>
    errors.push(`${room.sessionId}: ${e.code} ${e.msg}`),
  );
  room.onMessage('*', () => undefined);
  return { room, card, entered };
}

export async function runLive(opts: LiveOptions): Promise<LiveResult> {
  const health = (await (await fetch(`${opts.url}/health`)).json()) as { ok: boolean; build: string };
  if (!health.ok) throw new Error(`/health answered ${JSON.stringify(health)}`);
  const build = health.build;
  const client = new Client(opts.url);
  const errors: string[] = [];
  const options = (i: number): JoinOptions => ({ name: `Live${i}`, build, deviceId: `live-${i}` });

  const leader = await client.create('party', options(0));
  const code = leader.roomId;
  const seats: Seat[] = [seat(leader, errors)];
  for (let i = 1; i < opts.count; i++) seats.push(seat(await client.joinById(code, options(i)), errors));
  for (const s of seats) s.room.send('lobby.ready', { ready: true });
  const ms = opts.timeoutS * 1000;
  const quick = opts.mode === 'onub';
  if (quick) {
    leader.send('lobby.settings', { mode: GameMode.onub });
    await withTimeout(
      (async () => {
        while (stateOf(leader).settings?.mode !== GameMode.onub) await sleep(50);
      })(),
      ms,
      'the quick mode setting',
    );
  }
  leader.send('lobby.start', {});

  const first = quick ? 'bakery' : 'overworld';
  let cards = 0;
  let entered = 0;
  let dusk = 0;
  try {
    await withTimeout(Promise.all(seats.map((s) => s.card.then(() => cards++))), ms, 'every role card');
    await withTimeout(
      Promise.all(
        seats.map((s) =>
          s.entered.then((sceneId) => {
            if (sceneId === first) entered++;
          }),
        ),
      ),
      ms,
      'every sceneEnter',
    );
    if (quick)
      await withTimeout(
        Promise.all(
          seats.map(async (s) => {
            while (stateOf(s.room).phase < Phase.dusk) await sleep(50);
            dusk++;
          }),
        ),
        ms,
        'the dusk phase',
      );
  } finally {
    await Promise.all(seats.map((s) => s.room.leave(true).catch(() => undefined)));
  }
  return { build, code, seats: seats.length, cards, entered, dusk, errors };
}

export function parseLiveArgs(argv: string[]): LiveOptions {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const url = (get('--url') ?? process.env.SERVER_URL ?? '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(url))
    throw new Error('usage: --url https://<server> [--count 5] [--timeout 30] [--mode main|onub]');
  const count = Number(get('--count') ?? 5);
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('--count must be 1 to 10');
  const timeoutS = Number(get('--timeout') ?? 30);
  if (!Number.isFinite(timeoutS) || timeoutS <= 0) throw new Error('--timeout must be positive seconds');
  const mode = get('--mode') ?? 'main';
  if (mode !== 'main' && mode !== 'onub') throw new Error('--mode must be main or onub');
  return { url, count, timeoutS, mode };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const opts = parseLiveArgs(process.argv.slice(2));
  try {
    const r = await runLive(opts);
    const quick = opts.mode === 'onub';
    const ok =
      r.cards === r.seats && r.entered === r.seats && (!quick || r.dusk === r.seats) && r.errors.length === 0;
    console.log(
      `[live] ${opts.url} build ${r.build}: party ${r.code}, ${r.seats} seats, ${r.cards} role cards, ` +
        `${r.entered} entered the ${quick ? 'bakery' : 'overworld'}` +
        (quick ? `, ${r.dusk} in dusk` : '') +
        (r.errors.length ? `, errors: ${r.errors.join('; ')}` : ''),
    );
    process.exit(ok ? 0 : 1);
  } catch (e) {
    console.error(`[live] FAILED: ${(e as Error).message}`);
    process.exit(1);
  }
}
