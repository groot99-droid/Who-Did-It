// Bot brain shared by the swarm, the walkers and the soak (ARCHITECTURE 5.12). A bot walks at random
// (or stands on its spawn), reports bodies in reach, votes in meetings per `vote`, and, when its own card
// holds `kill` and `killer` is set, hunts and strikes the nearest player in reach once the cooldown allows.
// It never reads anything a real client would not receive.
//
//   pnpm --filter @wdi/bots walk -- --code ABCDE --count 6 [--url http://localhost:2567]
//        [--vote skip|leader|random|other|<name>] [--no-report] [--killer] [--no-walk]
//
// Against a real lobby the bots just join and act once the match starts.
import { Client, type Room } from '@colyseus/sdk';
import { abilities, balance, scenes } from '@wdi/content';
import {
  BUILD_VERSION,
  DIRECTIONS,
  ErrorCode,
  type JoinOptions,
  Phase,
  type RoleRevealPayload,
  TICK_RATE,
  TILE_PX,
} from '@wdi/shared';
import { fileURLToPath } from 'node:url';

export const DEFAULT_URL = 'http://localhost:2567';
const REACH_PX = balance.doors.reachTiles * TILE_PX;
function rangePx(id: string): number {
  const tiles = abilities.abilities[id]?.rangeTiles;
  if (tiles === undefined) throw new Error(`abilities.json: ${id} has no rangeTiles`);
  return tiles * TILE_PX;
}
const REPORT_PX = rangePx('report');
/** A little inside the server's reach so a strike is not refused by a rounding step. */
const KILL_PX = rangePx('kill') * 0.9;
const SEE_PX = balance.vision.dayTiles * TILE_PX;
const REFUSALS: ReadonlySet<number> = new Set(Object.values(ErrorCode));
const isWorld = (phase: number) => phase >= Phase.grace && phase <= Phase.night;
const isMeeting = (phase: number) => phase === Phase.meetingDiscussion || phase === Phase.meetingVote;
/** A bot gives a vote up after this many refusals in one meeting. */
const MAX_VOTE_REFUSALS = 6;

/**
 * What a bot casts at a meeting: Skip, the leader, a random living player (or Skip), a random living
 * player other than itself and never Skip (`other`), or a player by name.
 */
export type VoteMode = 'skip' | 'leader' | 'random' | 'other' | (string & {});

export interface BotBehavior {
  /** Random-walk (and steer to bodies and prey). False keeps the bot on its spawn. Default true. */
  walk?: boolean;
  /** Default `skip`. */
  vote?: VoteMode;
  /** Report a body in reach; a walking bot also steps toward a body it sees. Default false. */
  report?: boolean;
  /** Strike with the Knife when the card holds `kill`. Default false. */
  killer?: boolean;
}

export interface WalkerStats {
  ticksSent: number;
  portals: number;
  /** Refusals (422 to 428), which a soak expects. */
  errors: number;
  /** Error codes outside the refusal set: a protocol error. Must stay 0. */
  protocolErrors: number;
  /** Players seen with a presence in a scene other than the bot's own, outside a transit. Must stay 0. */
  leaks: number;
  kills: number;
  reports: number;
  votes: number;
  meetings: number;
}

interface BodyLike {
  id: string;
  x: number;
  y: number;
  hidden: boolean;
}
interface PlayerLike {
  id: string;
  name: string;
  alive: boolean;
  hasVoted: boolean;
  sceneId: number;
  presence?: { x: number; y: number; statusBits: number };
  priv?: { cooldownEndTick: { get(key: string): number | undefined } };
}
interface StateLike {
  phase: number;
  tick: number;
  leaderId: string;
  players: {
    forEach(cb: (p: PlayerLike, id: string) => void): void;
    get(id: string): PlayerLike | undefined;
  };
  scenes?: {
    get(key: string): SceneLike | undefined;
    forEach(cb: (scene: SceneLike, key: string) => void): void;
  };
}
/** A scene in the bot's view: the bodies and the walking figures under their opaque handles (A50). */
interface SceneLike {
  bodies: { forEach(cb: (b: BodyLike) => void): void };
  avatars: {
    forEach(
      cb: (a: { lookOf: string; x: number; y: number; statusBits: number }, handle: string) => void,
    ): void;
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

/** The id a vote of `mode` names, or "skip". Pure over the roster so it can be tested. */
export function pickVote(
  mode: VoteMode,
  selfId: string,
  leaderId: string,
  roster: Array<{ id: string; name: string; alive: boolean }>,
  rng: () => number,
): string {
  const living = roster.filter((p) => p.alive);
  if (mode === 'skip') return 'skip';
  if (mode === 'leader') return living.find((p) => p.id === leaderId)?.id ?? 'skip';
  if (mode === 'other') {
    const others = living.filter((p) => p.id !== selfId);
    return others[Math.floor(rng() * others.length)]?.id ?? 'skip';
  }
  if (mode === 'random') {
    const others = living.filter((p) => p.id !== selfId);
    const i = Math.floor(rng() * (others.length + 1));
    return others[i]?.id ?? 'skip';
  }
  return living.find((p) => p.name === mode)?.id ?? 'skip';
}

export interface Bot {
  stats: WalkerStats;
  /** Resolves with the bot's own role card. */
  card: Promise<RoleRevealPayload>;
  stop(): void;
}

export function startWalker(room: Room, rng: () => number, behavior: BotBehavior = {}): Bot {
  const stats: WalkerStats = {
    ticksSent: 0,
    portals: 0,
    errors: 0,
    protocolErrors: 0,
    leaks: 0,
    kills: 0,
    reports: 0,
    votes: 0,
    meetings: 0,
  };
  const walk = behavior.walk !== false;
  const holdsKnife = () => !!behavior.killer && !!card?.abilities.some((a) => a.id === 'kill');
  let seq = 0;
  let dir = DIR_VECTORS[Math.floor(rng() * 8)]!;
  let moving = true;
  let sprint = false;
  let decideAt = 0;
  let card: RoleRevealPayload | undefined;
  let dead = false;
  let lastVoteAt = 0;
  let lastReportAt = 0;
  let lastKillAt = 0;
  const reported = new Set<string>();
  let voteRefusals = 0;
  let resolveCard!: (c: RoleRevealPayload) => void;
  const cardPromise = new Promise<RoleRevealPayload>((r) => (resolveCard = r));

  room.onMessage('error', (e: { code?: number }) => {
    if (e && REFUSALS.has(e.code ?? 0)) {
      stats.errors++;
      if (isMeeting((room.state as unknown as StateLike | undefined)?.phase ?? 0)) voteRefusals++;
    } else stats.protocolErrors++;
  });
  room.onMessage('noise', () => undefined);
  room.onMessage('roleReveal', (c: RoleRevealPayload) => {
    card = c;
    // The card is the bot's own; dismissing it counts as Ready.
    room.send('lobby.ready', { ready: true });
    resolveCard(c);
  });
  room.onMessage('killed', () => (dead = true));
  room.onMessage('meetingStart', (m: { bodyOf?: string }) => {
    stats.meetings++;
    voteRefusals = 0;
    if (m?.bodyOf) reported.add(`body_${m.bodyOf}`);
  });

  const timer = setInterval(() => {
    const state = room.state as unknown as StateLike | undefined;
    const me = state?.players.get(room.sessionId);
    if (!state || !me) return;
    const now = Date.now();

    if (state.phase === Phase.lobby) {
      // A new match starts from a clean slate.
      dead = false;
      reported.clear();
    }
    // Meetings: vote as soon as one opens, again if the server has not recorded it.
    if (isMeeting(state.phase)) {
      if (!dead && !me.hasVoted && now - lastVoteAt > 700) {
        lastVoteAt = now;
        const roster: Array<{ id: string; name: string; alive: boolean }> = [];
        state.players.forEach((p) => roster.push({ id: p.id, name: p.name, alive: p.alive }));
        const targetId = pickVote(behavior.vote ?? 'skip', room.sessionId, state.leaderId, roster, rng);
        // Refused too often: give the vote up.
        if (voteRefusals < MAX_VOTE_REFUSALS) {
          room.send('meeting.vote', { targetId });
          stats.votes++;
        }
      }
      return;
    }
    if (!me.presence || !isWorld(state.phase)) return;

    // Round 5 (A50): a client holds only its own scene, so the scene key is the one in `state.scenes`.
    let sceneKey: keyof typeof scenes = 'overworld';
    state.scenes?.forEach((_scene, key) => {
      if (key in scenes) sceneKey = key as keyof typeof scenes;
    });
    const scene = scenes[sceneKey];
    const { x, y } = me.presence;
    let steer: { dx: number; dy: number } | undefined;
    let standStill = false;

    // Report a body in reach; a walking bot steps toward one it sees.
    // A Killer never reports its own work.
    if (behavior.report && !dead && !holdsKnife()) {
      let best: BodyLike | undefined;
      let bestD = Infinity;
      state.scenes?.get(sceneKey)?.bodies.forEach((b) => {
        if (b.hidden || reported.has(b.id)) return;
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < bestD && d <= SEE_PX) {
          best = b;
          bestD = d;
        }
      });
      if (best) {
        if (bestD <= REPORT_PX * 0.9) {
          standStill = true;
          if (now - lastReportAt > 600) {
            lastReportAt = now;
            reported.add(best.id);
            room.send('act.reportBody', { bodyId: best.id });
            stats.reports++;
          }
        } else if (walk) steer = unit(best.x - x, best.y - y, bestD);
      }
    }

    // The Knife: nearest living player in my scene; hunt it when the cooldown is up, strike in reach.
    const knifeReady =
      holdsKnife() &&
      !dead &&
      state.phase >= Phase.day &&
      (me.priv?.cooldownEndTick.get('kill') ?? 0) <= state.tick;
    if (knifeReady && !standStill) {
      const mates = new Set(card?.teammates.map((t) => t.id));
      let prey: { handle: string; x: number; y: number } | undefined;
      let preyD = Infinity;
      // Round 5 (A50): the figures in my scene are avatars under opaque handles; `lookOf` names the seat drawn.
      state.scenes?.get(sceneKey)?.avatars.forEach((a, handle) => {
        if (a.lookOf === room.sessionId || mates.has(a.lookOf) || (a.statusBits & 1) !== 0) return;
        const d = Math.hypot(a.x - x, a.y - y);
        if (d < preyD) {
          prey = { handle, x: a.x, y: a.y };
          preyD = d;
        }
      });
      if (prey) {
        if (preyD <= KILL_PX) {
          if (now - lastKillAt > 500) {
            lastKillAt = now;
            room.send('act.ability', { abilityId: 'kill', targetId: prey.handle });
            stats.kills++;
          }
        } else if (walk && !steer) steer = unit(prey.x - x, prey.y - y, preyD);
      }
    }

    if (!walk) return;

    if (now >= decideAt) {
      decideAt = now + 1000 + rng() * 2000;
      dir = DIR_VECTORS[Math.floor(rng() * 8)]!;
      moving = rng() > 0.2;
      sprint = rng() < 0.3;
      if (rng() < 0.25) {
        // Head for the nearest door now and then so a soak crosses portals often.
        let best = Infinity;
        for (const p of scene.portals) {
          const vx = (p.x + 0.5) * TILE_PX - x;
          const vy = (p.y + 0.5) * TILE_PX - y;
          const d = Math.hypot(vx, vy);
          if (d < best && d > 1) {
            best = d;
            dir = { dx: vx / d, dy: vy / d };
          }
        }
        moving = true;
      }
      const door = scene.portals.find(
        (p) => Math.hypot(x - (p.x + 0.5) * TILE_PX, y - (p.y + 0.5) * TILE_PX) <= REACH_PX,
      );
      if (door && !steer && rng() < 0.4) {
        room.send('act.enterPortal', { portalId: door.id });
        stats.portals++;
      }
    }
    const go = steer ?? dir;
    const on = !standStill && (steer !== undefined || moving);
    room.send('input.move', {
      seq: ++seq,
      dx: on ? go.dx : 0,
      dy: on ? go.dy : 0,
      sprint: steer ? false : sprint,
      sneak: false,
    });
    stats.ticksSent++;
    // Leak monitor: a presence outside my scene is only legitimate during that player's transit. A ghost
    // sees through its own scene's view, so it does not check.
    if (!dead)
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
  return { stats, card: cardPromise, stop: () => clearInterval(timer) };
}

function unit(dx: number, dy: number, d: number): { dx: number; dy: number } {
  return d > 0 ? { dx: dx / d, dy: dy / d } : { dx: 0, dy: 0 };
}

export interface WalkOptions extends BotBehavior {
  code: string;
  count: number;
  url?: string;
  prefix?: string;
  seed?: number;
}

export async function joinWalkers(opts: WalkOptions) {
  const client = new Client(opts.url ?? DEFAULT_URL);
  const rooms: Room[] = [];
  const walkers: Bot[] = [];
  const rng = mulberry(opts.seed ?? 1);
  // Walkers report and strike when asked; they stand still only with `walk: false`.
  const behavior: BotBehavior = { ...opts, report: opts.report ?? true };
  for (let i = 0; i < opts.count; i++) {
    const options: JoinOptions = {
      name: `${opts.prefix ?? 'Walk'}${i + 1}`,
      build: BUILD_VERSION,
      deviceId: `walk-${opts.prefix ?? 'Walk'}-${i + 1}`,
    };
    const room = await client.joinById(opts.code.toUpperCase(), options);
    room.onMessage('*', () => undefined);
    rooms.push(room);
    walkers.push(startWalker(room, mulberry(Math.floor(rng() * 2 ** 31)), behavior));
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
  const get = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
  const code = get('--code');
  if (!code)
    throw new Error(
      'usage: walk --code ABCDE [--count 6] [--url URL] [--vote skip|leader|random|other|NAME] [--no-report] [--killer] [--no-walk]',
    );
  void joinWalkers({
    code,
    count: Number(get('--count') ?? 6),
    ...(get('--url') ? { url: get('--url') as string } : {}),
    ...(get('--vote') ? { vote: get('--vote') as string } : {}),
    walk: !argv.includes('--no-walk'),
    report: !argv.includes('--no-report'),
    killer: argv.includes('--killer'),
  }).then((swarm) => {
    console.log(`[walk] ${swarm.rooms.length} bots walking; Ctrl+C to stop`);
    process.on('SIGINT', () => void swarm.stop().then(() => process.exit(0)));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
