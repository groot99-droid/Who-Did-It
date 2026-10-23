import type { PartyRoom } from '../../rooms/PartyRoom';
import { simOf } from '../RoomSim';
import { sceneKey } from '../World';
import { vicarSeat } from './conversion';
import { activeBody, progressOf } from './progress';
import { sabotageTargets } from './sabotage';
import { vendettaOf } from './state';

/** Where an NPC Killer's vendetta asks it to go: a scene, and the seat it is about when there is one. */
export interface VendettaGoal {
  sceneId: string;
  targetSeat?: string;
}

/**
 * The NPC hook (GDD 3.20 "NPC Killers"; `docs/round7/vendettas.md` 2): the brain reads it as one more place to walk
 * to under its routine weights. Null when the seat holds no vendetta, it is over, or there is nowhere to go.
 * Session 7H; the brain (`sim/npc/**`) is 6Z's.
 */
export function vendettaGoalFor(room: PartyRoom, seatId: string): VendettaGoal | null {
  const v = vendettaOf(room, seatId);
  const prog = v ? progressOf(room, seatId) : null;
  const me = simOf(room).players.get(seatId);
  if (!v || !prog || prog.over || !me || me.dead) return null;
  if (v.kind === 'conversion') {
    const vicar = prog.sown ? null : vicarSeat(room);
    const body = vicar === null ? null : activeBody(room, vicar);
    return vicar !== null && body ? { sceneId: sceneKey(body.sceneIdx), targetSeat: vicar } : null;
  }
  if (v.kind === 'sabotage') {
    const target = sabotageTargets(room).find((t) => !prog.tampered.includes(t.prop));
    return target ? { sceneId: target.scene } : null;
  }
  return null;
}
