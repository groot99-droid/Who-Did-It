import { abilities, roles } from '@wdi/content';
import { ItemStack, S2C, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { countRow } from './Flow';
import { nightOf } from './nightMemory';
import { simOf } from './RoomSim';

// Inherit (GDD 3.2, 3.3; round-5 `deck/wire.md` 5). Session 5G owns this file. When a death or an ejection leaves no
// living Killer and a living Accomplice, the Accomplice takes the Knife: it turns into the `heir` card (the Accomplice's
// kit and abilities with `kill`; `roles.json`), because the strike validator reads the card. Only a private
// `inherit` message goes out; the seat's look, name and every public field stay as they were.

/** The role row a Knife-bearing Accomplice plays as (`roles.json`). */
export const HEIR = 'heir';

const holdsKnife = (roleId: string | undefined): boolean =>
  roleId !== undefined && roles.roles[roleId]?.abilities.includes('kill') === true;

/** Every tick (`runNightPowers`): hands the Knife to a living Accomplice when no Killer lives. */
export function runInherit(room: PartyRoom): void {
  const sim = simOf(room);
  const mem = nightOf(room);
  let accomplice: string | null = null;
  for (const [id, player] of room.state.players) {
    if (sim.players.get(id)?.dead !== false) continue; // dead (even secretly) or not seated in the sim
    const roleId = player.priv?.role.roleId;
    if (holdsKnife(roleId)) return; // a Killer lives
    if (roleId === 'accomplice' && !mem.inherited.has(id)) accomplice ??= id;
  }
  if (accomplice === null) return;
  const player = room.state.players.get(accomplice);
  if (!player?.priv) return;
  mem.inherited.add(accomplice);
  player.priv.role.roleId = HEIR;
  if (!player.priv.inventory.slots.some((s) => s.defId === 'knife')) {
    const knife = new ItemStack();
    knife.defId = 'knife';
    knife.qty = 1;
    player.priv.inventory.slots.push(knife);
  }
  const tick = room.state.tick;
  const bonusS = abilities.abilities.inherit?.params?.killCooldownBonusS ?? 0;
  const cooldownS = countRow(room.state.players.size).killCooldownS + bonusS;
  player.priv.cooldownEndTick.set('kill', tick + Math.round(cooldownS * TICK_RATE));
  mem.lastStrikeRound.set(accomplice, room.state.round); // it counts as having struck in this round (Hunger)
  room.clients.getById(accomplice)?.send(S2C.inherit, {});
}
