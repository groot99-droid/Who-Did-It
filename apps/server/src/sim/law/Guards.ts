import { type DamageRow, type SceneId, type TownsfolkRow, abilities, balance } from '@wdi/content';
import { TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { hurt, showClip } from '../body/damage';
import { hasEffect } from '../body/effects';
import { bodyOf } from '../body/state';
import type { Verb } from '../body/verbs';
import { AnimId } from '../constants';
import type { Station } from '../npc/routine';
import { simOf } from '../RoomSim';
import type { Figure, FigureAct } from '../townsfolk/figures';
import { walkFigure } from '../townsfolk/walk';
import { reject, sceneIndex, tileCentre } from '../World';

/**
 * The guard figures (round 10, B1; GDD 3.24, F4 2.2): the two Constables of every map and the Company Clerk. A
 * guard is an ambient figure (`townsfolk/figures.ts`): no card, no seat, no vote, its own stream, an avatar under an
 * opaque handle. It keeps a post, its row's first station on the map, and walks only the stations of its row within
 * `guard.leashTiles` of it, day and night. Struck with the fists or the slingshot, it fights back at the striker
 * with the fist's row while the striker stays in its scene and within the leash, for `guard.angerS`. A guard reads
 * only what the world shows (who struck it), never a card.
 */

interface GuardState {
  /** The stand it keeps, in pixels of `scene`. */
  post: { scene: SceneId; x: number; y: number };
  /** The seat that struck it last, while it fights back. */
  foe: string | null;
  foeUntilTick: number;
  nextSwingTick: number;
}

const guards = new WeakMap<Figure, GuardState>();

export const isGuard = (f: Figure): boolean => guards.has(f);

/** One guard plan per `count` of each guard row, in row order (they spawn after the counted townsfolk). */
export function guardPlans(
  rows: readonly [string, TownsfolkRow][],
): { kind: string; row: TownsfolkRow; pinned: null; index: number }[] {
  const out: { kind: string; row: TownsfolkRow; pinned: null; index: number }[] = [];
  for (const [kind, row] of rows) {
    if (!row.guard) continue;
    for (let index = 0; index < (row.count ?? 1); index++) out.push({ kind, row, pinned: null, index });
  }
  return out;
}

/**
 * A guard's route: the post is the first prop on the map of its row's kinds, starting at the `index`th kind (the
 * second Constable takes the second kind); then every other kind's first prop in the post's scene within the leash.
 */
export function leashRoute(row: TownsfolkRow, index: number, props: readonly Station[]): Station[] {
  const kinds = row.stations.map((_, i) => row.stations[(i + index) % row.stations.length] as string);
  let post: Station | undefined;
  const route: Station[] = [];
  for (const kind of kinds) {
    const s = props.find((q) => q.kind === kind && (post === undefined || q.scene === post.scene));
    if (!s) continue;
    if (post === undefined) post = s;
    else if (Math.hypot(s.x - post.x, s.y - post.y) > balance.guard.leashTiles) continue;
    route.push(s);
  }
  return route;
}

/** Binds a spawned figure of a guard row: its post is its first station's first stand, its home the post's scene. */
export function bindGuard(f: Figure): void {
  const first = f.stations[0];
  const stand = first?.stands[0];
  const post =
    first && stand
      ? { scene: first.scene, x: tileCentre(stand.x, TILE_PX), y: tileCentre(stand.y, TILE_PX) }
      : null;
  if (!post) return;
  f.home = post.scene;
  guards.set(f, { post, foe: null, foeUntilTick: 0, nextSwingTick: 0 });
}

/** By night a guard stands at its post (the `home` act, so it never wanders off its leash). */
export function guardNightAct(f: Figure): FigureAct | null {
  const g = guards.get(f);
  if (!g) return null;
  return { kind: 'home', untilTick: Number.POSITIVE_INFINITY, station: null, goal: { ...g.post } };
}

const withinLeash = (g: GuardState, sceneIdx: number, x: number, y: number): boolean =>
  sceneIdx === sceneIndex(g.post.scene) &&
  Math.hypot(x - g.post.x, y - g.post.y) <= balance.guard.leashTiles * TILE_PX;

/**
 * A guard's tick before its routine (`townsfolk/run.ts`): knocked out it stands; with a foe in its scene and leash
 * it walks to the foe and swings the fist's row on the strike's cooldown. Returns whether it used the tick.
 */
export function stepGuard(room: PartyRoom, f: Figure): boolean {
  const g = guards.get(f);
  if (!g) return false;
  const body = bodyOf(room, f.id);
  if (body && hasEffect(body, 'knockedOut')) {
    g.foe = null;
    f.act = null;
    return true;
  }
  if (g.foe === null) return false;
  const tick = room.state.tick;
  const foe = simOf(room).players.get(g.foe);
  const foeBody = bodyOf(room, g.foe);
  if (
    tick >= g.foeUntilTick ||
    !foe ||
    foe.dead ||
    !foe.placed ||
    foe.sceneIdx !== f.sceneIdx ||
    !foeBody ||
    hasEffect(foeBody, 'knockedOut') ||
    !withinLeash(g, foe.sceneIdx, foe.x, foe.y)
  ) {
    g.foe = null;
    f.act = null; // back to its post's route
    return false;
  }
  const strike = abilities.abilities.strike;
  const reach = (strike?.rangeTiles ?? 1) * TILE_PX;
  const walked = walkFigure(room, f, foe.x, foe.y, reach * 0.9);
  if (walked === 'stuck') {
    g.foe = null;
    f.act = null;
    return false;
  }
  if (walked !== 'arrived') return true;
  f.yaw = Math.atan2(foe.x - f.x, -(foe.y - f.y));
  if (tick >= g.nextSwingTick && body) {
    g.nextSwingTick = tick + Math.round((strike?.cooldownS ?? 1) * TICK_RATE);
    showClip(body, AnimId.strike, tick);
    hurt(room, g.foe, balance.body.damage.strike, { source: 'guard' });
  }
  return true;
}

/** The one-shot clip a guard shows (its strike, flinch, knockdown), or `down` while knocked out; null for none. */
export function guardClip(room: PartyRoom, f: Figure): number | null {
  if (!guards.has(f)) return null;
  const body = bodyOf(room, f.id);
  if (!body) return null;
  if (body.clip >= 0 && room.state.tick < body.clipUntilTick) return body.clip;
  return hasEffect(body, 'knockedOut') ? AnimId.down : null;
}

/**
 * A body verb's target when its handle is a guard's (`fists.ts`): undefined when the handle is no guard's, null
 * with the refusal sent, else the guard, alive, standing, in the actor's scene and the verb's reach.
 */
export function guardTarget(
  room: PartyRoom,
  sessionId: string,
  v: Verb,
  handle: unknown,
  figureOf: (handle: string) => Figure | undefined,
): Figure | null | undefined {
  if (typeof handle !== 'string') return undefined;
  const f = figureOf(handle);
  if (!f || !guards.has(f)) return undefined;
  if (f.dead || f.sceneIdx !== v.actor.sceneIdx) {
    reject(room, sessionId, 'NO_TARGET');
    return null;
  }
  if (Math.hypot(f.x - v.actor.x, f.y - v.actor.y) > (v.def.rangeTiles ?? 0) * TILE_PX) {
    reject(room, sessionId, 'TOO_FAR', { of: 'person' });
    return null;
  }
  const body = bodyOf(room, f.id);
  if (!body || hasEffect(body, 'knockedOut')) {
    reject(room, sessionId, 'TARGET_DOWN');
    return null;
  }
  return f;
}

/** A seat's fist or slingshot lands on a guard: its body takes the row, and a guard still standing turns on the seat. */
export function strikeGuard(
  room: PartyRoom,
  f: Figure,
  row: DamageRow,
  by: string,
  source: string,
  factor = 1,
): void {
  const g = guards.get(f);
  const out = hurt(room, f.id, row, { source, by, factor });
  if (!g) return;
  if (out === 'hurt') {
    g.foe = by;
    g.foeUntilTick = room.state.tick + Math.round(balance.guard.angerS * TICK_RATE);
  } else g.foe = null;
}
