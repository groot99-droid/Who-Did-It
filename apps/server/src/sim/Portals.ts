import { balance, profileFor, scenes, type Portal, type SceneId } from '@wdi/content';
import {
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
import { type PlayerSim, simOf } from './RoomSim';
import { isSceneId, isWorldPhase, navGrid, profileOpen, sceneIndex, sceneKey, tileCentre } from './World';
import { reconcileViews } from './Visibility';

const ticks = (seconds: number): number => Math.round(seconds * TICK_RATE);

function reject(room: PartyRoom, sessionId: string, code: number, msg: string): void {
  room.clients.getById(sessionId)?.send(S2C.error, { code, msg });
}

/** Sends `noise` to everyone in `sceneId` within `radiusTiles` of (x, y), except `exceptId`. */
function emitNoise(
  room: PartyRoom,
  sceneId: SceneId,
  x: number,
  y: number,
  radiusTiles: number,
  kind: string,
  exceptId: string,
): void {
  const sim = simOf(room);
  const reach = radiusTiles * TILE_PX;
  const idx = sceneIndex(sceneId);
  for (const client of room.clients) {
    const player = room.state.players.get(client.sessionId);
    const p = sim.players.get(client.sessionId);
    if (!player || !p?.placed || client.sessionId === exceptId || player.sceneId !== idx) continue;
    if (Math.hypot(p.x - x, p.y - y) <= reach) {
      client.send(S2C.noise, { sceneId, x: Math.round(x), y: Math.round(y), kind });
    }
  }
}

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
 * placement (the start of the match).
 */
export function enterScene(
  room: PartyRoom,
  player: PlayerState,
  p: PlayerSim,
  sceneId: SceneId,
  spawnId: string,
  transit: boolean,
): boolean {
  const spawn = scenes[sceneId].spawns.find((s) => s.id === spawnId);
  if (!spawn) return false;
  const sim = simOf(room);
  const x = tileCentre(spawn.x, TILE_PX);
  const y = tileCentre(spawn.y, TILE_PX);
  if (overlapsSolid(navGrid(sceneId, sim.profile), x, y, FOOT_HALF_PX, FOOT_HALF_PX)) return false;
  const tick = room.state.tick;
  const fromScene = player.sceneId;
  p.x = x;
  p.y = y;
  p.vx = p.vy = 0;
  p.input = null;
  room.commands.clearMove(player.id);
  p.resetRing();
  player.sceneId = sceneIndex(sceneId);
  const presence = player.presence;
  presence.x = Math.round(x);
  presence.y = Math.round(y);
  presence.animId = 0;
  if (transit) {
    const until = tick + ticks(balance.doors.transitS);
    p.busyUntilTick = until;
    p.transitFrom = fromScene;
    presence.transitUntilTick = until;
    presence.statusBits = StatusBit.transit;
  } else {
    p.busyUntilTick = 0;
    p.transitFrom = -1;
    presence.transitUntilTick = 0;
    presence.statusBits = 0;
  }
  room.clients.getById(player.id)?.send(S2C.sceneEnter, { sceneId, spawn: spawn.id, facing: spawn.facing });
  return true;
}

/** First placement of every player when the match starts: spread on the `square_<n>` spawns. */
export function placeNewPlayers(room: PartyRoom): void {
  const sim = simOf(room);
  if (!isWorldPhase(room.state.phase)) return;
  if (![...sim.players.values()].some((p) => p.placed)) {
    // The first placement fixes the profile for the match from the party size (GDD 3.9).
    sim.profile = profileFor(Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS_TO_START, room.state.players.size)));
    applyProfileToDoors(room);
  }
  for (const [sessionId, p] of sim.players) {
    if (p.placed) continue;
    const player = room.state.players.get(sessionId);
    if (!player) continue;
    const spawn = `square_${p.ordinal % 10}`;
    if (enterScene(room, player, p, 'overworld', spawn, false)) {
      p.placed = true;
      player.alive = true;
    }
  }
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
    if (tick < p.busyUntilTick) {
      reject(room, req.sessionId, ErrorCode.busy, 'busy');
      continue;
    }
    const from = sceneKey(player.sceneId);
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
    if (portal.lock !== null) {
      // Keys are inventory items and arrive with M5; until then a keyed door stays locked.
      reject(room, req.sessionId, ErrorCode.locked, 'locked');
      continue;
    }
    if (!isSceneId(portal.to) || !enterScene(room, player, p, portal.to, portal.toSpawn, true)) {
      reject(room, req.sessionId, ErrorCode.cannot, 'no way through');
      continue;
    }
    crossed = true;
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
