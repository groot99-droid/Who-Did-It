import { economy, type PerkKey } from '@wdi/content';
import type { PartyRoom } from '../../rooms/PartyRoom';

/**
 * The HQ perks (round 8, GDD 3.23), Session 8D. A station's bought tiers give their perks to every seat walking in
 * the station's look (A131's rule: the look, never the card), so the reads take the seat's public look. Tiers are
 * public: they live in `tiersOf` (mirrored to `GameState.hq` once its row lands) and every tier up to the bought one
 * applies.
 */

const tiers = new WeakMap<object, Map<string, number>>();

/** The bought tier of each station by station id (0 for none). Room memory keyed by the match's `MatchSeeds`. */
export function tiersOf(room: PartyRoom): Map<string, number> {
  let m = tiers.get(room.seeds);
  if (!m) tiers.set(room.seeds, (m = new Map()));
  return m;
}

/** The perk values that apply to a seat, from every bought tier of every station of its look. */
function perkValues(room: PartyRoom, seat: string, key: PerkKey): number[] {
  const look = room.state.players.get(seat)?.look ?? '';
  if (look === '') return [];
  const out: number[] = [];
  for (const [id, station] of Object.entries(economy.hq.stations)) {
    if (station.look !== look) continue;
    const bought = tiersOf(room).get(id) ?? 0;
    for (const tier of station.tiers.slice(0, bought)) {
      const v = tier.perks[key];
      if (v !== undefined) out.push(v);
    }
  }
  return out;
}

/** A multiplying perk (`faithGain`, `rentDue`, ...): the product of every value that applies, 1 when none does. */
export const perkMul = (room: PartyRoom, seat: string, key: PerkKey): number =>
  perkValues(room, seat, key).reduce((a, b) => a * b, 1);

/** A counting perk (`slipsExtra`, `noticesHeld`) or a flag (`famishedImmune`): the sum, 0 when none applies. */
export const perkSum = (room: PartyRoom, seat: string, key: PerkKey): number =>
  perkValues(room, seat, key).reduce((a, b) => a + b, 0);
