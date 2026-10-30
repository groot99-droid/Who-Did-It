import { abilities, balance, economy, scenes } from '@wdi/content';
import { TICK_RATE, TILE_PX, chancePerTick, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { runAction } from '../Actions';
import { handleBuy } from '../economy/shops';
import { count } from '../Inventory';
import { type PlayerSim, simOf } from '../RoomSim';
import { canSee } from '../Sight';
import { heldBySnare } from '../snares';
import { isVerbPhase, sceneKey } from '../World';
import type { Brain } from './memory';
import { playRng } from './memory';
import { GOAL_SLACK, walkTo } from './walk';

// An NPC seat's snares and Rope (round 10, K6b; GDD 3.5, 3.12 "Hidden seats"): what a human may be seen doing with a
// Snare or a Rope, an NPC seat does too, by its own `npcPlay` stream and through the human verbs, whatever its card.
// It buys a Snare at a stall that sells one, sets the Snare it holds outdoors, and frees a held seat it sees with its
// Rope; so neither a set snare, a purchase nor a freeing marks a human.

/** Per room: an NPC seat -> the held seat it chose to free, or '' after a roll against it, by victim. */
const choices = new WeakMap<PartyRoom, Map<string, Map<string, boolean>>>();
function choiceOf(room: PartyRoom, npc: string, victim: string): boolean {
  let all = choices.get(room);
  if (!all) choices.set(room, (all = new Map()));
  let mine = all.get(npc);
  if (!mine) all.set(npc, (mine = new Map()));
  let yes = mine.get(victim);
  if (yes === undefined) mine.set(victim, (yes = playRng(room, npc)() < balance.snare.npc.ropeChance));
  return yes;
}

/** A shop that sells Snares, at this counter, while the seat holds none and can pay: a reason to visit (`chores.ts`). */
export function snareShopAt(room: PartyRoom, player: PlayerState, propId: string): string | undefined {
  if (count(player, 'snare') > 0) return undefined;
  const id = Object.keys(economy.shops).find(
    (s) => economy.shops[s]!.prop === propId && economy.shops[s]!.sells.includes('snare'),
  );
  if (id === undefined) return undefined;
  return player.priv.purse >= (economy.prices.snare?.ask ?? Infinity) ? id : undefined;
}

/** At such a counter: buys one Snare with the human verb, by `snare.npc.buyChance`. */
export function maybeBuySnare(room: PartyRoom, id: string, player: PlayerState, propId: string): void {
  const shopId = snareShopAt(room, player, propId);
  if (shopId === undefined || playRng(room, id)() >= balance.snare.npc.buyChance) return;
  handleBuy(room, id, { shopId, itemId: 'snare', qty: 1 });
}

/**
 * One tick, before the routine (`world.ts`): a seat holding a Rope walks to a held seat it sees and frees it, if its
 * roll for that seat said yes; returns whether it drove the seat. Outdoors, a seat holding a Snare sets it by
 * `snare.npc.setChancePer10s`, and walks on.
 */
export function runNpcSnares(room: PartyRoom, brain: Brain, player: PlayerState, p: PlayerSim): boolean {
  if (!isVerbPhase(room.state.phase)) return false;
  const id = player.id;
  if (count(player, 'rope') > 0) {
    for (const [vid, v] of simOf(room).players) {
      if (vid === id || v.dead || !v.placed || v.sceneIdx !== p.sceneIdx || !heldBySnare(room, vid)) continue;
      if (!canSee(room, p, v) || !choiceOf(room, id, vid)) continue;
      const reach = (abilities.abilities.rope?.rangeTiles ?? 0) * TILE_PX * 0.9;
      if (walkTo(room, brain, p, v.x, v.y, reach / GOAL_SLACK) !== 'arrived') return true;
      const handle = room.state.players.get(vid)?.priv.avatar ?? '';
      runAction(room, id, 'act.ability', { abilityId: 'rope', targetId: handle });
      return true;
    }
  }
  if (
    count(player, 'snare') > 0 &&
    scenes[sceneKey(p.sceneIdx)].kind !== 'interior' &&
    playRng(room, id)() < chancePerTick(balance.snare.npc.setChancePer10s, TICK_RATE)
  )
    runAction(room, id, 'act.ability', { abilityId: 'snare' });
  return false;
}
