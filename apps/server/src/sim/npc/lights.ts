import { balance, isDarkScene, scenes } from '@wdi/content';
import { TICK_RATE, npcDelayTicks } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { holdsLight, lightBurns, setLight } from '../mobs/light';
import { dayPartOf } from '../mobs/spawn';
import { type PlayerSim } from '../RoomSim';
import { sceneKey } from '../World';
import { timingRng } from './memory';

/**
 * An NPC seat's light (round 10, K3; GDD 3.15 "Lights", 3.12 hidden seats). A lit light shows as the lantern bit, so a
 * seat that never lit one would be the human: an NPC seat lights the light it holds by the rule a person would
 * follow, at dusk and by night (every scene is dark then) and in a scene that is dark by day, a delay drawn on
 * `npcTiming` after the rule says so (`kit.npcLightDelayS`), and puts it out when the rule stops. Card-blind: it reads
 * the inventory, the phase and the scene, never the card.
 */

/** Seat -> the tick it lights at, while the rule holds and the light is not yet lit. Room memory only. */
const pending = new WeakMap<PartyRoom, Map<string, number>>();

/** Whether the rule says a seat in this scene wants a light now. */
const wantsLight = (room: PartyRoom, p: PlayerSim): boolean =>
  dayPartOf(room.state.phase) !== 'day' || isDarkScene(scenes[sceneKey(p.sceneIdx)]);

/** One tick of an NPC seat's light, in a world phase, for a living placed seat. */
export function runNpcLight(room: PartyRoom, seat: string, p: PlayerSim): void {
  const player = room.state.players.get(seat);
  if (!player) return;
  let waits = pending.get(room);
  if (!waits) pending.set(room, (waits = new Map()));
  const burning = lightBurns(room, seat);
  if (!wantsLight(room, p)) {
    waits.delete(seat);
    if (burning) setLight(room, seat, false);
    return;
  }
  if (burning || !holdsLight(player)) return;
  const due = waits.get(seat);
  if (due === undefined) {
    const { min, max } = balance.kit.npcLightDelayS;
    waits.set(seat, room.state.tick + npcDelayTicks(timingRng(room, seat), min, max, TICK_RATE));
  } else if (room.state.tick >= due) {
    waits.delete(seat);
    setLight(room, seat, true);
  }
}
