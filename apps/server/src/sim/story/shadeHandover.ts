import type { PartyRoom } from '../../rooms/PartyRoom';
import { rehandle } from '../Avatars';
import { swapBodies } from '../body/state';
import { npcMemory } from '../npc/memory';
import { simOf } from '../RoomSim';
import { martyrSeatOf, moveShade, shadeOf } from '../rite/shade';

/**
 * The shade handover (story R8, `docs/story/arc.md` 3.4 and E15, A608; R8-Q5). A section that plays the shade
 * (`shade: true`) gives the player the martyr's body, not the Vicar card in the player's living body. The card
 * handover (`switchRole`, A415) runs first and moves the card-bound fields (card, kit, look, traits, name) between the
 * two seats; this then exchanges the bodies themselves: where each stands, whether it lives, its health record, its
 * corpse, its avatar and the shade's mark. Afterwards the player's seat is the waiting shade where the martyr fell,
 * and the seat it left goes on alive, where the player stood, as the NPC holding the player's old card. Every other
 * per-seat memory stays with its seat, as at any card handover. Returns false when the match has no waiting shade.
 */
export function takeShade(room: PartyRoom, humanId: string): boolean {
  const martyr = shadeOf(room);
  if (martyr === null || martyr !== martyrSeatOf(room)) return false;
  if (martyr === humanId) return true;
  swapPlaces(room, humanId, martyr);
  swapBodies(room, humanId, martyr);
  renameCorpse(room, martyr, humanId);
  moveShade(room, martyr, humanId);
  rehandle(room, humanId, false, false);
  rehandle(room, martyr, false, false);
  simOf(room).viewsDirty = true;
  return true;
}

const PLACE = [
  'x',
  'y',
  'vx',
  'vy',
  'placed',
  'sceneIdx',
  'dead',
  'transitFrom',
  'bloodyUntilTick',
  'bandagedUntilTick',
  'blindUntilTick',
] as const;

/** The two seats exchange where they stand and whether they live; what each was doing stops. */
function swapPlaces(room: PartyRoom, a: string, b: string): void {
  const sim = simOf(room);
  const pa = sim.players.get(a);
  const pb = sim.players.get(b);
  const ra = room.state.players.get(a);
  const rb = room.state.players.get(b);
  if (!pa || !pb || !ra || !rb) return;
  for (const key of PLACE) {
    const held = pa[key];
    (pa as unknown as Record<string, unknown>)[key] = pb[key];
    (pb as unknown as Record<string, unknown>)[key] = held;
  }
  for (const p of [pa, pb]) {
    p.input = null;
    p.hold = null;
    p.busyUntilTick = 0;
    p.resetRing();
  }
  const alive = ra.alive;
  ra.alive = rb.alive;
  rb.alive = alive;
  ra.priv.sceneId = pa.sceneIdx;
  rb.priv.sceneId = pb.sceneIdx;
}

/** The corpse `body_<from>` becomes `body_<to>`, in the scene and in every memory that names it (reports, NPCs). */
function renameCorpse(room: PartyRoom, from: string, to: string): void {
  const old = `body_${from}`;
  const id = `body_${to}`;
  for (const scene of room.state.scenes.values()) {
    const body = scene.bodies.get(old);
    if (!body) continue;
    scene.bodies.delete(old);
    body.id = id;
    body.of = to;
    scene.bodies.set(id, body);
  }
  const sim = simOf(room);
  if (sim.reportedBodies.delete(old)) sim.reportedBodies.add(id);
  const hidden = sim.hiddenBodies.get(old);
  if (hidden) {
    sim.hiddenBodies.delete(old);
    sim.hiddenBodies.set(id, { ...hidden, of: to });
  }
  for (const brain of npcMemory(room).brains.values()) {
    for (const set of [brain.seenBodies, brain.ownBodies]) if (set.delete(old)) set.add(id);
    const reached = brain.reachedBodyTick.get(old);
    if (reached !== undefined) {
      brain.reachedBodyTick.delete(old);
      brain.reachedBodyTick.set(id, reached);
    }
  }
}
