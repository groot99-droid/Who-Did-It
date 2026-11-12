import { type SceneId, balance } from '@wdi/content';
import { S2C } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { ensureBody, removeBody } from '../body/state';
import { emitSim } from '../events/bus';
import { startMartyrWindow } from '../Memorial';
import { enterScene } from '../Portals';
import { simOf } from '../RoomSim';
import { grantBuff } from './buff';

/**
 * The martyr's return (story R4, GDD 3.20, DECISIONS A603; A600 R-Q5). At the first day phase (or the Final Night)
 * after its rite is done, the shade comes back on the Train's respawn path (`Train.ts` `returnLine`), at the rite
 * site instead of the platform: `alive` true again, placed, its body gone from the scene and its health full (a new
 * body), its card, kit, notebook and quests kept, and its cooldowns resumed where they stood at its death. The
 * return is public, as any seat that lives again is, and it follows the look (R-Q3), so it says nothing of a cover.
 * The martyr's task window opens now (`Memorial.ts`, R-Q6). Only the seat itself is told: `rite { stage: 'returned' }`.
 * Returns false when the site cannot take it (no such scene on the map), and the caller makes it a ghost instead.
 */
export function returnMartyr(room: PartyRoom, seat: string, deathTick: number): boolean {
  const sim = simOf(room);
  const p = sim.players.get(seat);
  const player = room.state.players.get(seat);
  if (!p || !player) return false;
  const { scene, spawn } = balance.rite.site;
  if (!enterScene(room, player, p, scene as SceneId, spawn, false)) return false;
  const tick = room.state.tick;
  p.dead = false;
  p.placed = true;
  player.alive = true;
  for (const s of room.state.scenes.values()) s.bodies.delete(`body_${seat}`);
  removeBody(room, seat);
  ensureBody(room, seat); // a fresh body: full health, full stamina, no effects
  grantBuff(room, seat); // R5: the 10X Vicar's speed and health until dusk
  const cooldowns = player.priv.cooldownEndTick;
  for (const [key, end] of cooldowns) if (end > deathTick) cooldowns.set(key, end + (tick - deathTick));
  sim.viewsDirty = true;
  startMartyrWindow(room, seat);
  room.clients.getById(seat)?.send(S2C.rite, { stage: 'returned' });
  emitSim(room, { tick, kind: 'rite.returned', seat }); // story R8 (arc.md E17), as `riteEvent` in rite.ts
  return true;
}
