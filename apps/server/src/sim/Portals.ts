import { balance, profileFor, scenes, type Portal, type SceneId } from '@wdi/content';
import {
  DIRECTIONS,
  ErrorCode,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  S2C,
  TICK_RATE,
  TILE_PX,
  type PlayerState,
  overlapsSolid,
} from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { FOOT_HALF_PX, PORTAL_REACH_TILES, StatusBit } from './constants';
import { statusBitsOf } from './Movement';
import { emitNoise } from './Noise';
import { type PlayerSim, simOf } from './RoomSim';
import {
  isSceneId,
  isWorldPhase,
  navGrid,
  profileOpen,
  reject,
  sceneIndex,
  sceneKey,
  tileCentre,
} from './World';
import { spawnTeachingClue } from './Clues';
import { reconcileViews } from './Visibility';

const ticks = (seconds: number): number => Math.round(seconds * TICK_RATE);

/** The portal of `sceneId` nearest to a tile; the other half of a pair, used for the arrival swing. */
function nearestPortal(sceneId: SceneId, tx: number, ty: number): Portal | null {
  let best: Portal | null = null;
  let bestD = Infinity;
  for (const portal of scenes[sceneId].portals) {
    const d = Math.hypot(portal.x - tx, portal.y - ty);
    if (d < bestD) {
      best = portal;
      bestD = d;
    }
  }
  return best;
}

function swingDoor(room: PartyRoom, sceneId: SceneId, portalId: string): void {
  const door = room.state.scenes.get(sceneId)?.doors.get(portalId);
  if (door) door.swingUntilTick = room.state.tick + ticks(balance.doors.swingS);
}

/**
 * Puts a player on a spawn of a scene: position, ring, scene id, `sceneEnter`. With `transit` the
 * 0.6 s crossing starts (busy, inputs cleared, encoded to both scenes); without it the move is a plain
 * placement (the start of the match). With `announce` false no `sceneEnter` is sent: the meeting move
 * uses it, so the client's cue to leave the meeting is the announced placement at immunity (A30).
 */
export function enterScene(
  room: PartyRoom,
  player: PlayerState,
  p: PlayerSim,
  sceneId: SceneId,
  spawnId: string,
  transit: boolean,
  announce = true,
): boolean {
  const spawn = scenes[sceneId].spawns.find((s) => s.id === spawnId);
  if (!spawn) return false;
  const sim = simOf(room);
  const x = tileCentre(spawn.x, TILE_PX);
  const y = tileCentre(spawn.y, TILE_PX);
  if (overlapsSolid(navGrid(sceneId, sim.profile), x, y, FOOT_HALF_PX, FOOT_HALF_PX)) return false;
  const tick = room.state.tick;
  const fromScene = p.sceneIdx;
  p.x = x;
  p.y = y;
  p.vx = p.vy = 0;
  p.input = null;
  room.commands.clearMove(player.id);
  p.resetRing();
  p.sceneIdx = sceneIndex(sceneId);
  // A ghost whose death is not yet public keeps its public scene, or the roster would show it moving;
  // a quick-mode seat keeps it all night, so the roster never shows who woke (A39).
  if ((!p.dead || !player.alive) && !p.sceneHidden) player.sceneId = p.sceneIdx;
  const presence = player.presence;
  presence.x = Math.round(x);
  presence.y = Math.round(y);
  presence.animId = 0;
  presence.yaw = (Math.max(0, DIRECTIONS.indexOf(spawn.facing)) * Math.PI) / 4;
  if (transit) {
    const until = tick + ticks(balance.doors.transitS);
    p.busyUntilTick = until;
    p.transitFrom = fromScene;
    presence.transitUntilTick = until;
    presence.statusBits = StatusBit.transit | (statusBitsOf(p, tick) & StatusBit.bloody);
  } else {
    p.busyUntilTick = 0;
    p.transitFrom = -1;
    presence.transitUntilTick = 0;
    presence.statusBits = statusBitsOf(p, tick);
  }
  if (announce) {
    room.clients.getById(player.id)?.send(S2C.sceneEnter, { sceneId, spawn: spawn.id, facing: spawn.facing });
  }
  return true;
}

/** First placement of every player when the match starts: spread on the `square_<n>` spawns. */
export function placeNewPlayers(room: PartyRoom): void {
  const sim = simOf(room);
  if (!isWorldPhase(room.state.phase)) return;
  if (!sim.profileFixed) {
    // The first placement fixes the profile for the match from the party size (GDD 3.9).
    sim.profile = profileFor(Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS_TO_START, room.state.players.size)));
    applyProfileToDoors(room);
    sim.profileFixed = true;
  }
  spawnTeachingClue(room);
  let placedAny = false;
  for (const [sessionId, p] of sim.players) {
    if (p.placed) continue;
    const player = room.state.players.get(sessionId);
    if (!player) continue;
    const spawn = `square_${p.ordinal % 10}`;
    if (enterScene(room, player, p, 'overworld', spawn, false)) {
      p.placed = true;
      player.alive = true;
      placedAny = true;
    }
  }
  // Views follow the placement in the same step, so nobody's presence arrives before its sceneEnter.
  if (placedAny) sim.viewsDirty = true;
}

/**
 * runPortals: consumes the `act.enterPortal` requests runCommands queued, validates each against the
 * server's scene graph (phase, busy, reach, profile, lock) and runs the crossing synchronously.
 */
export function runPortals(room: PartyRoom): void {
  const sim = simOf(room);
  const requests = sim.portalRequests;
  if (requests.length === 0) return;
  sim.portalRequests = [];
  const tick = room.state.tick;
  let crossed = false;
  for (const req of requests) {
    const player = room.state.players.get(req.sessionId);
    const p = sim.players.get(req.sessionId);
    if (!player || !p) continue;
    if (!isWorldPhase(room.state.phase) || !p.placed) {
      reject(room, req.sessionId, ErrorCode.wrongPhase, 'not now');
      continue;
    }
    // A ghost has no busy state and no lock to respect (A30).
    if (!p.dead && tick < p.busyUntilTick) {
      reject(room, req.sessionId, ErrorCode.busy, 'busy');
      continue;
    }
    const from = sceneKey(p.sceneIdx);
    const portal = scenes[from].portals.find((q) => q.id === req.portalId);
    if (!portal) {
      reject(room, req.sessionId, ErrorCode.cannot, 'no such door');
      continue;
    }
    const dist = Math.hypot(p.x - tileCentre(portal.x, TILE_PX), p.y - tileCentre(portal.y, TILE_PX));
    if (dist > PORTAL_REACH_TILES * TILE_PX) {
      reject(room, req.sessionId, ErrorCode.outOfRange, 'too far');
      continue;
    }
    if (!profileOpen(portal.minProfile, sim.profile) || portal.to === null || portal.toSpawn === null) {
      reject(room, req.sessionId, ErrorCode.closed, 'boarded up');
      continue;
    }
    if (portal.lock !== null && !p.dead) {
      // Keys are inventory items and arrive with M5; until then a keyed door stays locked.
      reject(room, req.sessionId, ErrorCode.locked, 'locked');
      continue;
    }
    // A ghost's crossing is a plain move: no transit, no door swing, no noise (A30).
    if (!isSceneId(portal.to) || !enterScene(room, player, p, portal.to, portal.toSpawn, !p.dead)) {
      reject(room, req.sessionId, ErrorCode.cannot, 'no way through');
      continue;
    }
    crossed = true;
    if (p.dead) continue;
    swingDoor(room, from, portal.id);
    const arrival = nearestPortal(portal.to, p.x / TILE_PX, p.y / TILE_PX);
    if (arrival) swingDoor(room, portal.to, arrival.id);
    // The door sound at both ends; the far side hears it muffled (GDD 3.7, balance noise.portalFactor).
    emitNoise(
      room,
      from,
      tileCentre(portal.x, TILE_PX),
      tileCentre(portal.y, TILE_PX),
      balance.noise.door,
      'door',
      player.id,
    );
    emitNoise(
      room,
      portal.to,
      p.x,
      p.y,
      balance.noise.door * balance.noise.portalFactor,
      'doorMuffled',
      player.id,
    );
  }
  // Views follow the crossing at once instead of waiting for the next 5 Hz pass.
  if (crossed) reconcileViews(room);
}

/** Door states from the party size: a portal below the open profile is boarded (rendered closed). */
export function applyProfileToDoors(room: PartyRoom): void {
  const sim = simOf(room);
  for (const [id, scene] of Object.entries(scenes)) {
    const state = room.state.scenes.get(id);
    if (!state) continue;
    for (const portal of scene.portals) {
      const door = state.doors.get(portal.id);
      if (!door) continue;
      door.state = !profileOpen(portal.minProfile, sim.profile) ? 1 : portal.lock !== null ? 2 : 0;
    }
  }
}
