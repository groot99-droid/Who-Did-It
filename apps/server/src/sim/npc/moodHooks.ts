import { balance } from '@wdi/content';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { simOf } from '../RoomSim';
import { sceneKey } from '../World';
import type { Brain } from './memory';
import { needsOf } from './needs';
import { litAtNight, type Station } from './routine';

// The mood hooks of GDD 3.24 (round 10, T6, I40): the richer habits of `docs/round8/townsfolk.md` 1 beyond the weight
// line of `moodWeights`. A hook only narrows the pool of stations a work trip draws from, so what a seat does stays a
// station trip any seat makes: a Scared one works close to home, a Hungry one at the bakery, an Angry one where the
// seat it is angry at is, a Desperate one in a scene nobody stands in. A human who is frightened, hungry, angry or
// short of coin does the same, so nothing here marks a seat as an NPC (seams.md 6). It reads the needs only (never a
// card), draws once from the seat's own routine stream when its mood is not Calm, and puts nothing on the wire.

/** The shop a Hungry seat heads for, when the map has it (Crumb's Ovens). */
const FOOD_SCENE = 'bakery';

/**
 * `pool` narrowed by the seat's mood, or `pool` itself when the mood is Calm, the chance roll fails, or the hook finds
 * no station to prefer. One uniform is drawn from `rng` whenever the mood is not Calm, so the number of draws never
 * depends on the pool.
 */
export function moodPool(
  room: PartyRoom,
  brain: Brain,
  home: string | null,
  pool: readonly Station[],
  rng: () => number,
): readonly Station[] {
  const needs = needsOf(brain);
  if (needs.mood === 'calm') return pool;
  const roll = rng();
  if (roll >= balance.moodHooks.chance) return pool;
  const sim = simOf(room);
  let keep: (st: Station) => boolean;
  switch (needs.mood) {
    case 'hungry':
      keep = (st) => st.scene === FOOD_SCENE;
      break;
    case 'scared':
      keep = (st) => st.scene === home || litAtNight(st.scene);
      break;
    case 'angry': {
      const at = needs.angryAt === null ? undefined : sim.players.get(needs.angryAt);
      if (!at || at.dead || !at.placed) return pool;
      const scene = sceneKey(at.sceneIdx);
      keep = (st) => st.scene === scene;
      break;
    }
    default: {
      const crowded = new Set<string>();
      for (const o of sim.players.values()) if (!o.dead && o.placed) crowded.add(sceneKey(o.sceneIdx));
      keep = (st) => !crowded.has(st.scene);
    }
  }
  const narrowed = pool.filter(keep);
  return narrowed.length > 0 ? narrowed : pool;
}
