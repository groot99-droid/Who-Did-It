import { abilities, balance, roles, scenes, type SceneId } from '@wdi/content';
import { Phase, TICK_RATE, TILE_PX, chancePerTick, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { runAction } from '../Actions';
import { type PlayerSim, simOf } from '../RoomSim';
import { isLoft, sceneKey } from '../World';
import { hubOf, mapScenesOf } from '../MapSites';
import { difficultyRow } from './difficulty';
import type { Brain, NpcMemory } from './memory';
import { drive, firstPortalToward, stand, walkThrough, wander } from './walk';

/** A strike is made a little inside the server's reach so a rounding step never refuses it. */
const STRIKE_MARGIN = 0.9;

/** The scenes of a map that hold a basin (a Blood wash), built once per map's scene list. */
const basinCache = new WeakMap<readonly SceneId[], ReadonlySet<SceneId>>();
function basinScenesOf(room: PartyRoom): ReadonlySet<SceneId> {
  const list = mapScenesOf(room);
  let set = basinCache.get(list);
  if (!set) {
    set = new Set(list.filter((id) => scenes[id].props.some((q) => q.kind === 'basin')));
    basinCache.set(list, set);
  }
  return set;
}

const rangePx = (abilityId: string): number => (abilities.abilities[abilityId]?.rangeTiles ?? 0) * TILE_PX;

const unit = (dx: number, dy: number): { dx: number; dy: number } => {
  const d = Math.hypot(dx, dy);
  return d > 1e-6 ? { dx: dx / d, dy: dy / d } : { dx: 0, dy: 0 };
};

/** How far the seat sees: the day or night vision radius of the party (GDD 3.7). */
const sightPx = (room: PartyRoom): number =>
  (room.state.phase === Phase.night ? balance.vision.nightTiles : balance.vision.dayTiles) * TILE_PX;

/**
 * Takes in the bodies in sight. The first time a body is seen, every other living seat in sight
 * scores one (the suspicion stand-in for the Case Board, A41).
 */
function observe(room: PartyRoom, brain: Brain, player: PlayerState, p: PlayerSim): void {
  const scene = room.state.scenes.get(sceneKey(p.sceneIdx));
  if (!scene || scene.bodies.size === 0) return;
  const sight = sightPx(room);
  const sim = simOf(room);
  scene.bodies.forEach((body) => {
    if (body.hidden || brain.seenBodies.has(body.id)) return;
    if (Math.hypot(body.x - p.x, body.y - p.y) > sight) return;
    brain.seenBodies.add(body.id);
    for (const [id, other] of sim.players) {
      if (id === player.id || id === body.of || other.dead || !other.placed) continue;
      if (other.sceneIdx !== p.sceneIdx || isLoft(other.sceneIdx)) continue;
      if (Math.hypot(other.x - p.x, other.y - p.y) <= sight)
        brain.suspicion.set(id, (brain.suspicion.get(id) ?? 0) + 1);
    }
  });
}

/**
 * The lone human a Killer may strike: exactly one other living seat shares its scene, it is a human and not
 * a Cabal mate, and no crossing is under way (GDD 3.12 "alone with a human in its scene").
 */
function lonePrey(
  room: PartyRoom,
  player: PlayerState,
  p: PlayerSim,
  isNpc: (id: string) => boolean,
): string | null {
  const sim = simOf(room);
  const tick = room.state.tick;
  let prey: string | null = null;
  for (const [id, other] of sim.players) {
    if (id === player.id || other.dead || !other.placed || other.sceneIdx !== p.sceneIdx) continue;
    if (prey !== null) return null;
    prey = id;
    if (tick < other.busyUntilTick) return null;
  }
  if (prey === null || isNpc(prey) || player.priv.cabalMates.includes(prey)) return null;
  return prey;
}

/** One tick of an NPC in a main-mode world phase: strike, flee, report, else wander (GDD 3.12). */
export function runWorldNpc(
  room: PartyRoom,
  mem: NpcMemory,
  brain: Brain,
  player: PlayerState,
  p: PlayerSim,
): void {
  if (p.dead || !p.placed || isLoft(p.sceneIdx)) return stand(p);
  const tick = room.state.tick;
  if (tick < p.busyUntilTick) return;
  const id = player.id;
  const sim = simOf(room);
  observe(room, brain, player, p);
  if (!mem.walk) return stand(p);

  const killer = roles.roles[player.priv.role.roleId]?.abilities.includes('kill') ?? false;
  const diff = difficultyRow(room);

  if (killer) {
    if (brain.flee !== null && runFlee(room, brain, p, id)) return;
    const prey = room.state.phase === Phase.night ? lonePrey(room, player, p, (x) => mem.ids.has(x)) : null;
    const ready = (player.priv.cooldownEndTick.get('kill') ?? 0) <= tick;
    if (prey !== null && ready) {
      if (!brain.striking && mem.rng() < chancePerTick(diff.killChancePer10s, TICK_RATE))
        brain.striking = true;
      const target = sim.players.get(prey) as PlayerSim;
      if (brain.striking) {
        const d = Math.hypot(target.x - p.x, target.y - p.y);
        if (d > rangePx('kill') * STRIKE_MARGIN) {
          const v = unit(target.x - p.x, target.y - p.y);
          return drive(room, p, brain, v.dx, v.dy);
        }
        runAction(room, id, 'act.ability', { abilityId: 'kill', targetId: prey });
        brain.striking = false;
        if (target.dead) brain.flee = 'basin';
        return stand(p);
      }
    } else brain.striking = false;
  } else {
    // A body in sight: walk to it, stand by it, and report after the difficulty row's delay.
    const sight = sightPx(room);
    let best: { id: string; x: number; y: number; d: number } | null = null;
    room.state.scenes.get(sceneKey(p.sceneIdx))?.bodies.forEach((body) => {
      if (body.hidden || sim.reportedBodies.has(body.id)) return;
      const d = Math.hypot(body.x - p.x, body.y - p.y);
      if (d <= sight && (best === null || d < best.d)) best = { id: body.id, x: body.x, y: body.y, d };
    });
    const body = best as { id: string; x: number; y: number; d: number } | null;
    if (body) {
      if (body.d > rangePx('report') * STRIKE_MARGIN) {
        const v = unit(body.x - p.x, body.y - p.y);
        return drive(room, p, brain, v.dx, v.dy);
      }
      const since = brain.reachedBodyTick.get(body.id) ?? tick;
      brain.reachedBodyTick.set(body.id, since);
      if (tick - since >= Math.round(diff.reportDelayS * TICK_RATE)) {
        runAction(room, id, 'act.reportBody', { bodyId: body.id });
      }
      return stand(p);
    }
  }
  wander(room, mem, brain, p, id);
}

/**
 * A Killer's run after a strike (GDD 3.12): to the nearest scene with a basin, then to the map's hub
 * (`hubOf`). Returns whether it drove the seat this tick.
 */
function runFlee(room: PartyRoom, brain: Brain, p: PlayerSim, id: string): boolean {
  const here = sceneKey(p.sceneIdx);
  const hub = hubOf(room);
  const basins = basinScenesOf(room);
  if (brain.flee === 'basin' && basins.has(here)) brain.flee = 'square';
  if (brain.flee === 'square' && here === hub) brain.flee = null;
  if (brain.flee === null) return false;
  const goal = brain.flee === 'basin' ? (s: SceneId) => basins.has(s) : (s: SceneId) => s === hub;
  const portal = firstPortalToward(here, simOf(room).profile, goal, mapScenesOf(room));
  if (!portal || walkThrough(room, brain, p, id, portal) === 'stuck') {
    brain.flee = null;
    return false;
  }
  return true;
}
