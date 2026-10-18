import { balance } from '@wdi/content';
import { TICK_RATE, TILE_PX, moveAabb } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { AnimId, FOOT_HALF_PX, INPUT_STALE_TICKS, StatusBit } from './constants';
import { type MoveInput, type PlayerSim, simOf } from './RoomSim';
import { isLoft, isWorldPhase, navGrid, sceneKey } from './World';

const PX_PER_TICK = (tilesPerS: number): number => (tilesPerS * TILE_PX) / TICK_RATE;

/** Pixels per tick by posture (GDD 3.7): sneak beats sprint, so holding both walks quietly. */
export function speedPxPerTick(sprint: boolean, sneak: boolean): number {
  const m = balance.movement;
  if (sneak) return PX_PER_TICK(m.walkTilesPerS * m.sneakFactor);
  return PX_PER_TICK(sprint ? m.runTilesPerS : m.walkTilesPerS);
}

/**
 * Validates one untrusted `input.move` payload and returns it with the vector normalised, or null.
 * Diagonals and half-deflected sticks both come out as a unit vector: speed comes from the table.
 */
export function parseMove(raw: unknown, tick: number): MoveInput | null {
  if (raw === null || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const { seq, dx, dy } = p;
  if (typeof seq !== 'number' || !Number.isFinite(seq)) return null;
  if (typeof dx !== 'number' || typeof dy !== 'number' || !Number.isFinite(dx) || !Number.isFinite(dy))
    return null;
  const len = Math.hypot(dx, dy);
  const unit = len < 1e-3 ? { x: 0, y: 0 } : { x: dx / len, y: dy / len };
  return { seq, dx: unit.x, dy: unit.y, sprint: p.sprint === true, sneak: p.sneak === true, tick };
}

/**
 * applyInputs: exactly one input per client per tick, newest wins (the queue keeps only the newest), the
 * vector normalised server-side, the speed taken from the posture table. A client that goes quiet
 * stops after INPUT_STALE_TICKS.
 */
export function applyInputs(room: PartyRoom): void {
  const sim = simOf(room);
  const tick = room.state.tick;
  for (const [sessionId, raw] of room.commands.takeMoves()) {
    const p = sim.players.get(sessionId);
    if (!p) continue;
    const input = parseMove(raw, tick);
    if (input === null || input.seq <= p.lastSeq) continue;
    p.lastSeq = input.seq;
    p.input = input;
  }
  const walking = isWorldPhase(room.state.phase);
  for (const [sessionId, p] of sim.players) {
    p.vx = 0;
    p.vy = 0;
    if (!walking || !p.placed || p.input === null || isLoft(p.sceneIdx)) continue;
    if (tick - p.input.tick > INPUT_STALE_TICKS) {
      p.input = null;
      continue;
    }
    if (tick < p.busyUntilTick) continue;
    const speed = speedPxPerTick(p.input.sprint, p.input.sneak);
    p.vx = p.input.dx * speed;
    p.vy = p.input.dy * speed;
    const player = room.state.players.get(sessionId);
    if (player && (p.input.dx !== 0 || p.input.dy !== 0)) {
      player.presence.yaw = Math.atan2(p.input.dx, -p.input.dy);
    }
  }
}

/** moveAndCollide: swept AABB against the nav bitmap, the 250 ms ring, and the int16 Presence. */
export function moveAndCollide(room: PartyRoom): void {
  const sim = simOf(room);
  const tick = room.state.tick;
  if (!isWorldPhase(room.state.phase)) return;
  for (const [sessionId, p] of sim.players) {
    const player = room.state.players.get(sessionId);
    if (!player || !p.placed || isLoft(p.sceneIdx)) continue;
    if (p.transitFrom !== -1 && tick >= p.busyUntilTick) {
      // The crossing is over: the scene they left stops seeing them on this very tick.
      p.transitFrom = -1;
      sim.viewsDirty = true;
    }
    // Remember where the body stood, so `walk` follows the real displacement, not the command (no walking in
    // place against a wall, GDD 3.12 "Animation").
    const x0 = p.x;
    const y0 = p.y;
    if (p.vx !== 0 || p.vy !== 0) {
      // The sim's scene, not the public one: a ghost's public scene stays frozen after its crossings.
      const grid = navGrid(sceneKey(p.sceneIdx), sim.profile);
      if (p.dead) {
        // Ghosts walk through everything; only the edge of the scene stops them (A30).
        p.x = Math.min(Math.max(p.x + p.vx, 0), grid.w * grid.tile - 1);
        p.y = Math.min(Math.max(p.y + p.vy, 0), grid.h * grid.tile - 1);
      } else {
        const r = moveAabb(grid, p.x, p.y, p.vx, p.vy, FOOT_HALF_PX, FOOT_HALF_PX);
        p.x = r.x;
        p.y = r.y;
      }
    }
    p.pushRing();
    publishPresence(player.presence, p, p.x !== x0 || p.y !== y0, tick);
  }
}

/** `Presence.statusBits` of a player at a tick: transit while crossing, Blood while it lasts (GDD 3.4). */
export function statusBitsOf(p: PlayerSim, tick: number): number {
  return (
    (tick < p.busyUntilTick ? StatusBit.transit : 0) |
    (!p.dead && tick < p.bloodyUntilTick ? StatusBit.bloody : 0)
  );
}

/**
 * Writes the rounded position and the shared animation id; unchanged values cost no patch bytes. A running hold
 * shows `interact`, whoever holds and whatever the hold; `walk` only on a tick the position actually changed.
 */
export function publishPresence(
  presence: { x: number; y: number; animId: number; statusBits: number; transitUntilTick: number },
  p: PlayerSim,
  moving: boolean,
  tick: number,
): void {
  presence.x = Math.round(p.x);
  presence.y = Math.round(p.y);
  presence.animId = p.hold !== null ? AnimId.interact : moving ? AnimId.walk : AnimId.idle;
  presence.statusBits = statusBitsOf(p, tick);
}
