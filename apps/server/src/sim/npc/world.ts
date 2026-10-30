import { abilities, balance, roles, scenes, type SceneId } from '@wdi/content';
import { Phase, TICK_RATE, TILE_PX, chancePerTick, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { runAction } from '../Actions';
import { type PlayerSim, simOf } from '../RoomSim';
import { sceneKey } from '../World';
import { hubOf, mapScenesOf } from '../MapSites';
import { fleeCreature } from '../mobs/flee';
import { followPartner, shielded } from '../law/Pairing';
import { canSee } from '../Sight';
import { runBodyBands } from './hive/bands';
import { seesPoint } from './hive/senses';
import { difficultyRow } from './difficulty';
import { updateNeeds } from './needs';
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
    if (!seesPoint(room, p, p.sceneIdx, body.x, body.y)) return; // round 8, 8R: fair sight (granted by 6Z)
    brain.seenBodies.add(body.id);
    if (!brain.ownBodies.has(body.id) && !sim.reportedBodies.has(body.id)) {
      brain.startleUntilTick = tick + spanTicks(playRng(room, player.id), balance.npc.react.startleS);
    }
    for (const [id, other] of sim.players) {
      if (id === player.id || id === body.of || other.dead || !other.placed) continue;
      if (other.sceneIdx !== p.sceneIdx) continue;
      if (Math.hypot(other.x - p.x, other.y - p.y) <= sight)
        brain.suspicion.set(id, (brain.suspicion.get(id) ?? 0) + 1);
    }
  });
  // A clue seen for the first time: a roll for collecting it at the next choice (GDD 3.12 "Clues").
  const meta = sim.clueMeta;
  scene.clues.forEach((clue) => {
    if (brain.seenClues.has(clue.id) || meta.get(clue.id)?.collectors.has(player.id)) return;
    if (!seesPoint(room, p, p.sceneIdx, clue.x, clue.y)) return; // round 8, 8R: fair sight (granted by 6Z)
    brain.seenClues.add(clue.id);
    if (playRng(room, player.id)() < balance.npc.react.collectChance && brain.pendingClue === '') {
      brain.pendingClue = clue.id;
      brain.pendingClueScene = p.sceneIdx;
    }
  });
}

/**
 * The sole other living seat of the scene when it is a human not in transit (the strike roll's check, card-blind:
 * whether it is a Cabal mate is decided after the roll), else null. Round 6 (docs/round6/auto-admin.md 3, Session
 * 6A owns the body): in an auto match with `npcPrey` an NPC counts as prey too, so the brains play each other.
 */
export function preyFor(
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
  if (prey !== null && shielded(room, prey, player.id)) return null; // round 10, B8: a pair is not alone
  return prey === null || (isNpc(prey) && !simOf(room).auto?.npcPrey) ? null : prey;
}

/**
 * The kill-opportunity timer's companion (GDD 3.12, A100): the one other living seat, human or NPC, placed in the
 * Killer's room and not crossing a door, when that room is not the map's hub and the seat stands within
 * `npc.aloneKill.sightTiles` and in sight (`canSee`: darkness and walls); null otherwise, and null for a Cabal
 * mate. No draw: every NPC that holds the Knife keeps the timer, so the streams move the same.
 */
export function companionFor(room: PartyRoom, player: PlayerState, p: PlayerSim): string | null {
  if (sceneKey(p.sceneIdx) === hubOf(room)) return null;
  const sim = simOf(room);
  const tick = room.state.tick;
  let found: string | null = null;
  let other: PlayerSim | null = null;
  for (const [id, q] of sim.players) {
    if (id === player.id || q.dead || !q.placed || q.sceneIdx !== p.sceneIdx) continue;
    if (found !== null) return null;
    found = id;
    other = q;
  }
  if (found === null || other === null) return null;
  if (shielded(room, found, player.id)) return null; // round 10, B8: a pair is not alone (a townsperson partner too)
  if (tick < other.busyUntilTick || player.priv.cabalMates.includes(found)) return null;
  if (Math.hypot(other.x - p.x, other.y - p.y) > balance.npc.aloneKill.sightTiles * TILE_PX) return null;
  return canSee(room, p, other) ? found : null;
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
  brain.aloneWith = null;
  brain.aloneSinceTick = -1;
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
  brain.aloneWith = null;
  brain.aloneSinceTick = -1;
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
  if (p.dead || !p.placed) {
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
  updateNeeds(room, brain, player.id); // round 8, 8E: the needs and the mood (locked hook, seams.md 5)
  brain.mode = 'routine';
  if (!mem.walk) return stand(p);

  const killer = holdsKnife(player);
  const diff = difficultyRow(room);

  // The strike roll: one uniform on every check, whatever the card (npc.md 6, "card-blind draws").
  const killPhase =
    abilities.abilities.kill?.phases?.includes(phaseKeyOf(room.state.phase) as never) ?? false;
  const sole = killPhase ? preyFor(room, player, p, (x) => mem.ids.has(x)) : null;
  const roll = sole === null ? null : playRng(room, id)();

  if (killer) {
    if (brain.flee !== null && runFlee(room, brain, p, id)) {
      brain.mode = 'react';
      return;
    }
    // The kill-opportunity timer (A100): alone in a room with one seat, human or NPC, for longer than `afterS`.
    // It counts in every world phase and fires only when the Knife works; a change of company restarts it.
    const companion = brain.flee === null ? companionFor(room, player, p) : null;
    if (companion !== brain.aloneWith) {
      brain.aloneWith = companion;
      brain.aloneSinceTick = tick;
    }
    const timerDue =
      killPhase &&
      companion !== null &&
      tick - brain.aloneSinceTick > Math.round(balance.npc.aloneKill.afterS * TICK_RATE);
    const rolled = sole !== null && !player.priv.cabalMates.includes(sole) ? sole : null;
    const prey = rolled ?? (timerDue ? companion : null);
    const ready = (player.priv.cooldownEndTick.get('kill') ?? 0) <= tick;
    if (prey !== null && ready) {
      if (
        !brain.striking &&
        ((roll !== null && roll < chancePerTick(diff.killChancePer10s, TICK_RATE)) || timerDue)
      )
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
          // The body is ours: never startled at, never reported. The flee starts next tick and leaves the room by
          // the first portal of its route; the activity is dropped so nothing stale drives the seat.
          brain.ownBodies.add(`body_${prey}`);
          brain.seenBodies.add(`body_${prey}`);
          brain.flee = 'basin';
          brain.act = null;
          brain.aloneWith = null;
          brain.aloneSinceTick = -1;
        }
        return;
      }
    } else brain.striking = false;
  }

  if (followPartner(room, brain, p, id)) return; // round 10, B8: walking with a human partner

  // Round 6 (6G): a creature of this scene chasing the seat comes before any body (GDD 3.15).
  if (fleeCreature(room, id, brain, p)) {
    brain.mode = 'react';
    return;
  }

  // A body it did not make: freeze, walk to it, report it after the difficulty row's delay. A Killer NPC too.
  if (tick < brain.startleUntilTick) {
    brain.mode = 'react';
    return stand(p);
  }
  if (runBodyBands(room, mem, brain, player, p)) return; // round 8, 8R: the body bands (GDD 3.12, granted by 6Z)

  // Night: keep to lit scenes (GDD 3.12 "Night"). The leave delay is drawn on the first such tick, even while a
  // placement idle still holds the seat.
  const cls = phaseClassOf(room.state.phase);
  let restrict = false;
  let goHome = false;
  if (cls === 'night' && !litAtNight(sceneKey(p.sceneIdx))) {
    if (brain.leaveAtTick < 0) {
      brain.leaveAtTick = tick + spanTicks(playRng(room, id), balance.npc.night.leaveDelayS);
    }
    if (tick >= brain.leaveAtTick) goHome = true;
    else restrict = true;
  } else brain.leaveAtTick = -1;

  // A placement: stand before the routine resumes.
  if (tick < brain.placementIdleUntilTick) return stand(p);
  if (goHome && runHome(room, brain, player, p)) return;

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
