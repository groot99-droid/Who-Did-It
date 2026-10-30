import { balance } from '@wdi/content';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { avatarMemory, avatarOf } from '../Avatars';
import { onSim, type SimEvent } from '../events/bus';
import { isJailed } from '../law/Jail';
import { type PlayerSim, simOf } from '../RoomSim';
import { canSee } from '../Sight';
import { sceneKey } from '../World';
import type { Brain } from './memory';
import { needsOf } from './needs';
import { litAtNight, type Station } from './routine';

// The mood hooks of GDD 3.24 (round 10, T6b, I40): the richer habits of `docs/round8/townsfolk.md` 1 beyond the weight
// line of `moodWeights`. A hook only narrows the pool of stations a work trip draws from, so what a seat or figure does
// stays a station trip any seat makes: a Scared one works close to home or in a lit scene, a Hungry one at the bakery,
// an Angry one in its own scene near the face that struck it, a Desperate one in a scene nobody stands in. A human who
// is frightened, hungry, angry or short of coin does the same, so nothing here marks a seat as an NPC (seams.md 6).
//
// Secrecy (6Z's conditions): a hook reads the seat's own home, the scenes' public state (lit, who stands where in
// view) and needs; never a card. The Angry hook follows the FACE: `needs.angryAt` holds the true actor, which under an
// impersonation would show who struck, so this module keeps the drawn face (`Avatar.lookOf`) the victim saw at the
// event on a listener of its own and lingers near a figure drawn with it, only while that figure is in the victim's
// scene and in its sight (`canSee`), never near a seat that is dead, jailed or on the line, and never walks to another
// scene for it. It draws once from the caller's routine stream when the mood is not Calm, and puts nothing on the wire.

/** The shop a Hungry seat heads for, when the map has it (Crumb's Ovens). */
const FOOD_SCENE = 'bakery';

/** The one who stands where a hook looks from: an NPC seat's sim or a townsfolk figure (`sceneIdx`, `x`, `y`). */
export type Mover = Pick<PlayerSim, 'sceneIdx' | 'x' | 'y'>;

/** Victim id -> the look its striker or robber was drawn with at the event (a look id, never a seat). */
const faces = new WeakMap<PartyRoom, Map<string, string>>();
const wired = new WeakSet<PartyRoom>();

function faceMap(room: PartyRoom): Map<string, string> {
  let map = faces.get(room);
  if (!map) faces.set(room, (map = new Map()));
  if (!wired.has(room)) {
    wired.add(room);
    const note = (e: SimEvent) => {
      const victim = e.data?.target;
      const by = e.data?.by;
      if (typeof victim !== 'string' || typeof by !== 'string') return;
      const handle = avatarMemory(room).handleOf.get(by);
      const look = handle === undefined ? undefined : avatarOf(room, handle)?.lookOf;
      if (look !== undefined && look !== '') map?.set(victim, look);
    };
    onSim(room, 'body.hit', note);
    onSim(room, 'rob', note);
  }
  return map;
}

/** A seat the Angry hook may linger near: placed, alive, free, in the victim's scene and in its sight. */
function faceInSight(room: PartyRoom, who: Mover, ownId: string, look: string): Mover | null {
  const sim = simOf(room);
  for (const [seat, o] of sim.players) {
    if (seat === ownId || o.dead || !o.placed || o.sceneIdx !== who.sceneIdx || isJailed(room, seat))
      continue;
    if (room.state.players.get(seat)?.priv?.onLine === true) continue;
    const handle = avatarMemory(room).handleOf.get(seat);
    if (handle === undefined || avatarOf(room, handle)?.lookOf !== look) continue;
    if (canSee(room, who as PlayerSim, o)) return o;
  }
  return null;
}

/**
 * `pool` narrowed by the mood of `brain`, or `pool` itself when the mood is Calm, the chance roll fails, or the hook
 * finds no station to prefer. `ownId` is the caller's seat or figure id, `home` its home scene. One uniform is drawn
 * from `rng` whenever the mood is not Calm, so the number of draws never depends on the pool.
 */
export function moodPool(
  room: PartyRoom,
  brain: Brain,
  ownId: string,
  home: string | null,
  who: Mover,
  pool: readonly Station[],
  rng: () => number,
): readonly Station[] {
  const faceNotes = faceMap(room);
  const needs = needsOf(brain);
  if (needs.mood === 'calm') return pool;
  const roll = rng();
  if (roll >= balance.moodHooks.chance) return pool;
  const here = sceneKey(who.sceneIdx);
  let keep: (st: Station) => boolean;
  switch (needs.mood) {
    case 'hungry':
      keep = (st) => st.scene === FOOD_SCENE;
      break;
    case 'scared':
      keep = (st) => st.scene === home || litAtNight(st.scene);
      break;
    case 'angry': {
      const look = faceNotes.get(ownId);
      if (look === undefined || faceInSight(room, who, ownId, look) === null) return pool;
      keep = (st) => st.scene === here;
      break;
    }
    default: {
      const crowded = new Set<string>();
      for (const o of simOf(room).players.values())
        if (!o.dead && o.placed) crowded.add(sceneKey(o.sceneIdx));
      keep = (st) => !crowded.has(st.scene);
    }
  }
  const narrowed = pool.filter(keep);
  return narrowed.length > 0 ? narrowed : pool;
}
