import { abilities, balance, roles, scenes, type SceneId } from '@wdi/content';
import { Phase, TICK_RATE, TILE_PX, chancePerTick, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { runAction } from '../Actions';
import { type PlayerSim, simOf } from '../RoomSim';
import { isLoft, sceneKey } from '../World';
import { hubOf, mapScenesOf } from '../MapSites';
import { difficultyRow } from './difficulty';
import type { Brain, NpcMemory } from './memory';
import { playRng } from './memory';
import {
  legPause,
  litAtNight,
  phaseClassOf,
  phaseKeyOf,
  releaseClaims,
  runHome,
  runRoutine,
  spanTicks,
} from './routine';
import { GOAL_SLACK, firstPortalToward, stand, walkThrough, walkTo, wander } from './walk';

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

/** How far the seat sees: the day or night vision radius of the party (GDD 3.7). */
const sightPx = (room: PartyRoom): number =>
  (room.state.phase === Phase.night ? balance.vision.nightTiles : balance.vision.dayTiles) * TILE_PX;

/** A body is startled at the first time it is seen (a body this seat made is never startled at). */
function observe(room: PartyRoom, brain: Brain, player: PlayerState, p: PlayerSim): void {
  const scene = room.state.scenes.get(sceneKey(p.sceneIdx));
  if (!scene) return;
  const sight = sightPx(room);
  const sim = simOf(room);
  const tick = room.state.tick;
  scene.bodies.forEach((body) => {
    if (body.hidden || brain.seenBodies.has(body.id)) return;
    if (Math.hypot(body.x - p.x, body.y - p.y) > sight) return;
    brain.seenBodies.add(body.id);
    if (!brain.ownBodies.has(body.id) && !sim.reportedBodies.has(body.id)) {
      brain.startleUntilTick = tick + spanTicks(playRng(room, player.id), balance.npc.react.startleS);
    }
    for (const [id, other] of sim.players) {
      if (id === player.id || id === body.of || other.dead || !other.placed) continue;
      if (other.sceneIdx !== p.sceneIdx || isLoft(other.sceneIdx)) continue;
      if (Math.hypot(other.x - p.x, other.y - p.y) <= sight)
        brain.suspicion.set(id, (brain.suspicion.get(id) ?? 0) + 1);
    }
  });
  // A clue seen for the first time: a roll for collecting it at the next choice (GDD 3.12 "Clues").
  const meta = sim.clueMeta;
  scene.clues.forEach((clue) => {
    if (brain.seenClues.has(clue.id) || meta.get(clue.id)?.collectors.has(player.id)) return;
    if (Math.hypot(clue.x - p.x, clue.y - p.y) > sight) return;
    brain.seenClues.add(clue.id);
    if (playRng(room, player.id)() < balance.npc.react.collectChance && brain.pendingClue === '') {
      brain.pendingClue = clue.id;
      brain.pendingClueScene = p.sceneIdx;
    }
  });
}

/**
 * The sole other living seat of the scene when it is a human not in transit (the strike roll's check, card-blind:
 * whether it is a Cabal mate is decided after the roll), else null.
 */
function soleHuman(
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
  return prey === null || isNpc(prey) ? null : prey;
}

/** A placement (grace or immunity) puts the seat on the square: the routine starts over with a fresh scene dwell. */
function handlePlacement(
  room: PartyRoom,
  mem: NpcMemory,
  brain: Brain,
  player: PlayerState,
  p: PlayerSim,
): void {
  const tick = room.state.tick;
  const rng = playRng(room, player.id);
  brain.placementPending = false;
  brain.act = null;
  brain.path = null;
  brain.goalKey = '';
  brain.flee = null;
  brain.striking = false;
  brain.leaveAtTick = -1;
  brain.startleUntilTick = -1;
  brain.pauseUntilTick = -1;
  brain.fallbackUntilTick = -1;
  brain.crossingUntil = -1;
  brain.pendingClue = '';
  brain.walkTicks = 0;
  brain.sceneIdx = p.sceneIdx;
  brain.sceneEnteredTick = tick;
  brain.sceneDwellUntilTick = tick + spanTicks(rng, balance.npc.routine.sceneDwellS);
  brain.placementIdleUntilTick = tick + spanTicks(rng, balance.npc.react.afterPlacementIdleS);
  releaseClaims(mem, player.id);
}

/** A scene entered: a fresh dwell, and the pause roll after a portal leg. */
function trackScene(room: PartyRoom, brain: Brain, player: PlayerState, p: PlayerSim): void {
  if (brain.sceneIdx === p.sceneIdx) return;
  const tick = room.state.tick;
  const first = brain.sceneIdx < 0;
  brain.sceneIdx = p.sceneIdx;
  brain.sceneEnteredTick = tick;
  brain.sceneDwellUntilTick = tick + spanTicks(playRng(room, player.id), balance.npc.routine.sceneDwellS);
  brain.path = null;
  brain.goalKey = '';
  if (first) return;
  if (brain.act && brain.act.kind !== 'travel') brain.act = null;
  if (tick <= brain.crossingUntil) legPause(room, brain, player.id);
  brain.crossingUntil = -1;
}

/** The ticks walked and stood still, for the walking cap (GDD 3.12 "Legs and pauses"). */
function trackMotion(room: PartyRoom, brain: Brain, p: PlayerSim): void {
  const moved = p.x !== brain.lastX || p.y !== brain.lastY;
  brain.lastX = p.x;
  brain.lastY = p.y;
  if (brain.sceneIdx !== p.sceneIdx) {
    brain.stillTicks = 0;
    return;
  }
  if (moved) {
    if (brain.mode === 'routine' || brain.mode === 'home') brain.walkTicks++;
    brain.stillTicks = 0;
  } else if (++brain.stillTicks >= Math.round(balance.npc.routine.idleS.min * TICK_RATE)) brain.walkTicks = 0;
  void room;
}

const holdsKnife = (player: PlayerState): boolean =>
  roles.roles[player.priv.role.roleId]?.abilities.includes('kill') ?? false;

/** One tick of an NPC in a main-mode world phase: strike, flee, react, then the routine (GDD 3.12, npc.md 7). */
export function runWorldNpc(
  room: PartyRoom,
  mem: NpcMemory,
  brain: Brain,
  player: PlayerState,
  p: PlayerSim,
): void {
  const id = player.id;
  if (p.dead || !p.placed || isLoft(p.sceneIdx)) {
    if (p.dead) {
      releaseClaims(mem, id);
      brain.act = null;
    }
    brain.mode = 'routine';
    return stand(p);
  }
  const tick = room.state.tick;
  if (tick < p.busyUntilTick) return;
  const sim = simOf(room);
  trackMotion(room, brain, p);
  if (brain.placementPending) handlePlacement(room, mem, brain, player, p);
  trackScene(room, brain, player, p);
  observe(room, brain, player, p);
  brain.mode = 'routine';
  if (!mem.walk) return stand(p);

  const killer = holdsKnife(player);
  const diff = difficultyRow(room);

  // The strike roll: one uniform on every check, whatever the card (npc.md 6, "card-blind draws").
  const killPhase =
    abilities.abilities.kill?.phases?.includes(phaseKeyOf(room.state.phase) as never) ?? false;
  const sole = killPhase ? soleHuman(room, player, p, (x) => mem.ids.has(x)) : null;
  const roll = sole === null ? null : playRng(room, id)();

  if (killer) {
    if (brain.flee !== null && runFlee(room, brain, p, id)) {
      brain.mode = 'react';
      return;
    }
    const prey = sole !== null && !player.priv.cabalMates.includes(sole) ? sole : null;
    const ready = (player.priv.cooldownEndTick.get('kill') ?? 0) <= tick;
    if (prey !== null && ready) {
      if (!brain.striking && roll !== null && roll < chancePerTick(diff.killChancePer10s, TICK_RATE))
        brain.striking = true;
      const target = sim.players.get(prey) as PlayerSim;
      if (brain.striking) {
        brain.mode = 'react';
        const range = rangePx('kill') * STRIKE_MARGIN;
        if (Math.hypot(target.x - p.x, target.y - p.y) > range) {
          if (walkTo(room, brain, p, target.x, target.y, range / GOAL_SLACK) === 'stuck')
            brain.striking = false;
          return;
        }
        const handle = room.state.players.get(prey)?.priv.avatar || prey;
        runAction(room, id, 'act.ability', { abilityId: 'kill', targetId: handle });
        brain.striking = false;
        stand(p);
        if (target.dead) {
          // The body is ours: never startled at, never reported.
          brain.ownBodies.add(`body_${prey}`);
          brain.seenBodies.add(`body_${prey}`);
          brain.flee = 'basin';
        }
        return;
      }
    } else brain.striking = false;
  }

  // A body it did not make: freeze, walk to it, report it after the difficulty row's delay. A Killer NPC too.
  if (tick < brain.startleUntilTick) {
    brain.mode = 'react';
    return stand(p);
  }
  const sight = sightPx(room);
  let best: { id: string; x: number; y: number; d: number } | null = null;
  room.state.scenes.get(sceneKey(p.sceneIdx))?.bodies.forEach((body) => {
    if (body.hidden || sim.reportedBodies.has(body.id) || brain.ownBodies.has(body.id)) return;
    const d = Math.hypot(body.x - p.x, body.y - p.y);
    if (d <= sight && (best === null || d < best.d)) best = { id: body.id, x: body.x, y: body.y, d };
  });
  const body = best as { id: string; x: number; y: number; d: number } | null;
  if (body && tick >= brain.bodyRetryTick) {
    brain.mode = 'react';
    brain.act = null;
    releaseClaims(mem, id);
    const reach = rangePx('report') * STRIKE_MARGIN;
    if (body.d > reach) {
      if (walkTo(room, brain, p, body.x, body.y, reach / GOAL_SLACK) === 'stuck')
        brain.bodyRetryTick = tick + TICK_RATE;
      return;
    }
    const since = brain.reachedBodyTick.get(body.id) ?? tick;
    brain.reachedBodyTick.set(body.id, since);
    if (tick - since >= Math.round(diff.reportDelayS * TICK_RATE)) {
      runAction(room, id, 'act.reportBody', { bodyId: body.id });
    }
    return stand(p);
  }

  // A placement: stand before the routine resumes.
  if (tick < brain.placementIdleUntilTick) return stand(p);

  // Night: keep to lit scenes (GDD 3.12 "Night").
  const cls = phaseClassOf(room.state.phase);
  let restrict = false;
  if (cls === 'night' && !litAtNight(sceneKey(p.sceneIdx))) {
    if (brain.leaveAtTick < 0) {
      brain.leaveAtTick = tick + spanTicks(playRng(room, id), balance.npc.night.leaveDelayS);
    }
    if (tick >= brain.leaveAtTick) {
      if (runHome(room, brain, player, p)) return;
    } else restrict = true;
  } else brain.leaveAtTick = -1;

  if (!mem.routine) {
    brain.mode = 'fallback';
    return wander(room, mem, brain, p, id);
  }
  runRoutine(room, mem, brain, player, p, { restrict, killer });
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
