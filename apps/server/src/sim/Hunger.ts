import { balance, clues, roles } from '@wdi/content';
import { ClueKind, DIRECTIONS, Phase, TICK_RATE, TILE_PX, dirFromVector } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { decaySeconds, spawnClue } from './Clues';
import { nightOf } from './nightMemory';
import { isOnub } from './onub/state';
import { simOf } from './RoomSim';
import { isLoft, sceneKey } from './World';

// Hunger (GDD 3.3; round-5 `deck/wire.md` 5). Session 5G owns this file; the hook is called from its locked site in
// `Step.ts`. The strike rounds live in `nightMemory.ts` (`spendProtection` writes them, Inherit too).

/**
 * After `runAiAndHazards` (`Step.ts`): when a day (or the Final Night) starts round r, a living Killer whose last strike
 * is `hunger.cyclesWithoutKill` rounds old or older (round 0 when it never struck) becomes Hungry; a Hungry Killer
 * leaves a `hungerPrints` clue showing its own height on its tile for every `hunger.trailEveryS` it moves, in every
 * phase and whatever look it wears, until a strike ends the Hunger.
 */
export function runHunger(room: PartyRoom): void {
  if (isOnub(room) || room.state.phase < Phase.grace) return;
  const mem = nightOf(room);
  const state = room.state;
  if (state.phase !== mem.hungerPhase) {
    mem.hungerPhase = state.phase;
    if (state.phase === Phase.day || state.phase === Phase.finalNight) markHungry(room);
  }
  if (mem.hungry.size === 0) return;
  const sim = simOf(room);
  for (const [seat, since] of [...mem.hungry]) {
    const p = sim.players.get(seat);
    const struck = mem.lastStrikeRound.get(seat);
    if (!p || p.dead || (struck !== undefined && struck >= since)) {
      mem.hungry.delete(seat);
      mem.trail.delete(seat);
      continue;
    }
    if (!p.placed || isLoft(p.sceneIdx)) continue;
    const trail = mem.trail.get(seat) ?? { x: p.x, y: p.y, moving: 0 };
    if (Math.hypot(p.x - trail.x, p.y - trail.y) > 0.5) trail.moving++;
    trail.x = p.x;
    trail.y = p.y;
    if (trail.moving >= balance.hunger.trailEveryS * TICK_RATE) {
      trail.moving = 0;
      leavePrint(room, seat);
    }
    mem.trail.set(seat, trail);
  }
}

/** A day starts round r: every living Killer whose last strike was in round r − 1 − cycles or earlier is Hungry. */
function markHungry(room: PartyRoom): void {
  const mem = nightOf(room);
  const round = room.state.round;
  const sim = simOf(room);
  const limit = round - 1 - balance.hunger.cyclesWithoutKill;
  room.state.players.forEach((player, id) => {
    if (sim.players.get(id)?.dead !== false || mem.hungry.has(id)) return;
    if (!player.priv?.cooldownEndTick || !holdsKnife(player.priv.role.roleId)) return;
    if ((mem.lastStrikeRound.get(id) ?? 0) <= limit) mem.hungry.set(id, round);
  });
}

const holdsKnife = (roleId: string): boolean => roles.roles[roleId]?.abilities.includes('kill') === true;

/** One glowing footprint on the Killer's tile: its own height, its facing, gone after the clue's seconds. */
function leavePrint(room: PartyRoom, seat: string): void {
  const player = room.state.players.get(seat);
  const p = simOf(room).players.get(seat);
  if (!player || !p) return;
  const yaw = player.presence.yaw;
  const dir = DIRECTIONS.indexOf(dirFromVector(Math.sin(yaw), -Math.cos(yaw)));
  const def = clues.clues.hungerPrints;
  spawnClue(room, sceneKey(p.sceneIdx), {
    kind: ClueKind.hungerPrints,
    value: player.traits.height,
    dir,
    tx: Math.floor(p.x / TILE_PX),
    ty: Math.floor(p.y / TILE_PX),
    decayS: def ? decaySeconds(def.decay) : null,
  });
}
