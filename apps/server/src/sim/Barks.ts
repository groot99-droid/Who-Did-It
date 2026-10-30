import { balance } from '@wdi/content';
import { type RefusalReason, S2C, TICK_RATE, TILE_PX, npcDelayTicks } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { avatarMemory } from './Avatars';
import { bodyBlocksAct } from './body/run';
import { onSim } from './events/bus';
import { lightBurns } from './mobs/light';
import { mobBodies } from './Mobs';
import { seesPoint } from './npc/hive/senses';
import { npcMemory } from './npc/memory';
import { type PlayerSim, simOf } from './RoomSim';
import { isAsleep } from './Sleep';
import { figuresOf } from './townsfolk/figures';
import { isOnLine } from './Train';
import { isWorldPhase, reject, sceneIndex } from './World';

/**
 * Barks (round 10, M1; GDD 3.5 "Barks"; seams.md 3 row 36). A bark is a quick-chat line over one figure's head,
 * `S2C.bark {handle, phraseId}`, sent to the clients that are sent that avatar and stand within
 * `chat.quickChatRadiusTiles`. One function (`emitBark`) sends every bark, a human seat's from the wheel, an NPC
 * seat's and an ambient figure's, and the same gate (`barkReason`) holds for a human and an NPC seat. An NPC seat
 * or a figure barks from its own `barks:<id>` stream, which no card or private state reaches: at idle moments
 * (gaps from `chat.quickGapS` up, the whole pool) and at shared moments (a bell, a wolf near, a lantern lit),
 * so neither a seat that barks at the floor nor a line out of context marks a human. Every draw is made on a
 * timer or a moment whether or not the actor may bark, so the draw count never tells a seat's state.
 */

interface Actor {
  /** The stream key: a seat id or a figure id, never on the wire. */
  id: string;
  seat: boolean;
  sceneIdx: number;
  x: number;
  y: number;
  /** The seat's sim, for its sight; a figure has none. */
  sim: PlayerSim | null;
  handle: string | null;
  ready: boolean;
}

interface Moment {
  kind: 'bell' | 'wolf' | 'lantern';
  sceneIdx: number;
  x: number;
  y: number;
}

interface Pending {
  tick: number;
  phraseId: string;
}

interface BarkMemory {
  last: Map<string, number>;
  idleAt: Map<string, number>;
  pending: Map<string, Pending>;
  moments: Moment[];
  lit: Set<string>;
  wolves: Set<string>;
  wired: boolean;
}

const memories = new WeakMap<PartyRoom, BarkMemory>();
function memoryOf(room: PartyRoom): BarkMemory {
  let m = memories.get(room);
  if (!m) {
    m = {
      last: new Map(),
      idleAt: new Map(),
      pending: new Map(),
      moments: [],
      lit: new Set(),
      wolves: new Set(),
      wired: false,
    };
    memories.set(room, m);
  }
  return m;
}

const gapOpen = (room: PartyRoom, id: string): boolean => {
  const last = memoryOf(room).last.get(id);
  return last !== undefined && room.state.tick - last < balance.chat.quickGapS * TICK_RATE;
};

const POOL = (): readonly string[] => balance.chat.quickChat.map((l) => l.id);

/** Why `seat` may not bark now, or null: the one gate of a human's `chat.quick` and an NPC seat's bark. */
export function barkReason(room: PartyRoom, seat: string): RefusalReason | null {
  const p = simOf(room).players.get(seat);
  if (!p || p.dead || !p.placed || isOnLine(room, seat)) return 'NOT_IN_PLAY';
  if (!isWorldPhase(room.state.phase)) return 'PHASE_CLOSED';
  if (bodyBlocksAct(room, seat)) return 'DOWN_OR_STUNNED';
  if (isAsleep(room, seat)) return 'ASLEEP';
  return gapOpen(room, seat) ? 'CHAT_RATE' : null;
}

/**
 * Sends one bark. The recipients are the clients that hold the speaker's avatar (placed in the speaker's scene, the
 * dark rule of `canSee` for a living viewer, never a seat on the line or a blinded one) within the quick-chat
 * radius, and the speaker's own client.
 */
function emitBark(room: PartyRoom, speaker: Actor, handle: string, phraseId: string): void {
  const sim = simOf(room);
  const reach = balance.chat.quickChatRadiusTiles * TILE_PX;
  for (const client of room.clients) {
    const seat = client.sessionId;
    const viewer = sim.players.get(seat);
    if (!viewer?.placed || isOnLine(room, seat)) continue;
    if (seat !== speaker.id) {
      if (viewer.sceneIdx !== speaker.sceneIdx || viewer.blindUntilTick > room.state.tick) continue;
      if (Math.hypot(viewer.x - speaker.x, viewer.y - speaker.y) > reach) continue;
      if (!viewer.dead && !seesPoint(room, viewer, speaker.sceneIdx, speaker.x, speaker.y)) continue;
    }
    client.send(S2C.bark, { handle, phraseId });
  }
}

function actorOfSeat(room: PartyRoom, id: string): Actor | null {
  const p = simOf(room).players.get(id);
  if (!p) return null;
  return {
    id,
    seat: true,
    sceneIdx: p.sceneIdx,
    x: p.x,
    y: p.y,
    sim: p,
    handle: avatarMemory(room).handleOf.get(id) ?? null,
    ready: barkReason(room, id) === null,
  };
}

/** A human seat's bark: `chat.quick {phraseId}`, queued by the room and consumed in `runCommands`. */
export function handleQuick(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const id = typeof payload.phraseId === 'string' ? payload.phraseId : '';
  if (!POOL().includes(id)) return reject(room, sessionId, 'UNKNOWN_PHRASE');
  const why = barkReason(room, sessionId);
  if (why !== null) {
    if (why === 'NOT_IN_PLAY') return reject(room, sessionId, why, { why: 'ghost' });
    return reject(room, sessionId, why);
  }
  speak(room, actorOfSeat(room, sessionId), id);
}

function speak(room: PartyRoom, a: Actor | null, phraseId: string): void {
  if (!a?.handle) return;
  memoryOf(room).last.set(a.id, room.state.tick);
  emitBark(room, a, a.handle, phraseId);
}

/** The actors that may bark by themselves: every NPC seat and every living ambient figure. */
function actorsOf(room: PartyRoom): Actor[] {
  const out: Actor[] = [];
  for (const id of npcMemory(room).order) {
    const a = actorOfSeat(room, id);
    if (a) out.push(a);
  }
  for (const [id, f] of figuresOf(room)) {
    out.push({
      id,
      seat: false,
      sceneIdx: f.sceneIdx,
      x: f.x,
      y: f.y,
      sim: null,
      handle: f.handle,
      ready: !f.dead && !gapOpen(room, id),
    });
  }
  return out;
}

const wire = (room: PartyRoom, m: BarkMemory): void => {
  if (m.wired) return;
  m.wired = true;
  onSim(room, 'bell', (e) => {
    if (e.sceneId !== undefined)
      m.moments.push({ kind: 'bell', sceneIdx: sceneIndex(e.sceneId as never), x: 0, y: 0 });
  });
};

/** The tick's moments from the room: lights newly lit and wolves newly near, plus the bell the bus heard. */
function findMoments(room: PartyRoom, m: BarkMemory, actors: readonly Actor[]): void {
  for (const [id, p] of simOf(room).players) {
    const burns = lightBurns(room, id);
    if (burns && !m.lit.has(id)) m.moments.push({ kind: 'lantern', sceneIdx: p.sceneIdx, x: p.x, y: p.y });
    if (burns) m.lit.add(id);
    else m.lit.delete(id);
  }
  const reach = balance.bark.wolfTiles * TILE_PX;
  const near = new Set<string>();
  for (const mob of mobBodies(room).values()) {
    if (mob.def.id !== 'wolf') continue;
    for (const a of actors) {
      const sceneOfMob = mob.site.sceneIdx;
      if (a.sceneIdx !== sceneOfMob || Math.hypot(a.x - mob.x, a.y - mob.y) > reach) continue;
      const key = `${a.id}|${mob.id}`;
      near.add(key);
      if (!m.wolves.has(key)) m.moments.push({ kind: 'wolf', sceneIdx: a.sceneIdx, x: mob.x, y: mob.y });
    }
  }
  m.wolves = near;
}

/** Whether `a` takes in a moment: a bell is heard through its whole scene, the others where it could see them. */
function notices(room: PartyRoom, a: Actor, mo: Moment): boolean {
  if (a.sceneIdx !== mo.sceneIdx) return false;
  if (mo.kind === 'bell') return true;
  const reach =
    (mo.kind === 'wolf' ? balance.bark.wolfTiles : balance.chat.quickChatRadiusTiles * 2) * TILE_PX;
  if (Math.hypot(a.x - mo.x, a.y - mo.y) > reach) return false;
  return a.sim === null || seesPoint(room, a.sim, mo.sceneIdx, mo.x, mo.y);
}

/** The Step stage: NPC seats and figures bark at idle moments and at the tick's shared moments. */
export function runBarks(room: PartyRoom): void {
  const m = memoryOf(room);
  wire(room, m);
  if (!isWorldPhase(room.state.phase)) {
    m.moments.length = 0;
    return;
  }
  const tick = room.state.tick;
  const pool = POOL();
  const actors = actorsOf(room);
  findMoments(room, m, actors);
  const b = balance.bark;
  for (const a of actors) {
    const rng = room.seeds.get('barks', a.id);
    for (const mo of m.moments) {
      if (!notices(room, a, mo)) continue;
      // Three draws a moment, always: whether to bark, after how long, and which line of the moment's.
      const [chance, delay, line] = [rng(), rng(), rng()];
      if (m.pending.has(a.id) || chance >= b.reactChance) continue;
      const ids = b.moments[mo.kind];
      m.pending.set(a.id, {
        tick:
          tick +
          Math.max(
            1,
            Math.round((b.reactDelayS.min + delay * (b.reactDelayS.max - b.reactDelayS.min)) * TICK_RATE),
          ),
        phraseId: ids[Math.min(ids.length - 1, Math.floor(line * ids.length))] as string,
      });
    }
    const idleAt = m.idleAt.get(a.id);
    if (idleAt === undefined) {
      m.idleAt.set(a.id, tick + npcDelayTicks(rng, b.idleGapS.min, b.idleGapS.max, TICK_RATE));
      continue;
    }
    const due = m.pending.get(a.id);
    if (due !== undefined && tick >= due.tick) {
      m.pending.delete(a.id);
      if (a.ready) speak(room, a, due.phraseId);
    } else if (tick >= idleAt) {
      const phraseId = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] as string;
      m.idleAt.set(a.id, tick + npcDelayTicks(rng, b.idleGapS.min, b.idleGapS.max, TICK_RATE));
      if (a.ready) speak(room, a, phraseId);
    }
  }
  m.moments.length = 0;
}
