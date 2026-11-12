import { balance } from '@wdi/content';
import { TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { bodyOf } from '../body/state';
import { addFaith, dealtVicarOf } from '../economy/conversion';
import { onSim } from '../events/bus';
import { simOf } from '../RoomSim';
import { ascended } from './buff';

/**
 * The conversion aura (story R6, GDD 3.20, DECISIONS A607; A600 R-Q1 and R-Q3). While the **dealt** Vicar wears the
 * return day's buff (`ascended`, `buff.ts`), every other living, placed seat in its scene within `rite.aura.tiles` of
 * it gains `rite.aura.faithPerS` Faith a second, to `faith.max`; I9's tick check (`economy/conversion.ts`) converts it at
 * `conversion.faithAt`. The aura follows the dealt card, not the look (R-Q3, owner 2026-11-10): a cover in the Vicar's
 * look comes back with the buff but no aura. Nothing is public: each seat sees only its own Faith rise, and the aura
 * draws nothing. Whole Faith is added as it accrues; the fraction is carried per seat. Room memory only.
 */
const memories = new WeakMap<PartyRoom, Map<string, number>>();

function carryOf(room: PartyRoom): Map<string, number> {
  let carry = memories.get(room);
  if (carry) return carry;
  const c = new Map<string, number>();
  memories.set(room, (carry = c));
  onSim(room, 'start', () => c.clear());
  return carry;
}

/** Every tick (from `runMemorial`, before `runConversion`): the dealt Vicar's aura, while it is ascended. */
export function runAura(room: PartyRoom): void {
  const carry = carryOf(room);
  const vicar = dealtVicarOf(room);
  const players = simOf(room).players;
  const v = vicar === null ? undefined : players.get(vicar);
  const body = vicar === null ? undefined : bodyOf(room, vicar);
  if (!v || !body || v.dead || !v.placed || !ascended(body)) {
    if (carry.size > 0) carry.clear();
    return;
  }
  const reach = balance.rite.aura.tiles * TILE_PX;
  const perTick = balance.rite.aura.faithPerS / TICK_RATE;
  for (const [id, p] of players) {
    if (id === vicar || p.dead || !p.placed || p.sceneIdx !== v.sceneIdx) continue;
    if (Math.hypot(p.x - v.x, p.y - v.y) > reach) continue;
    const owed = (carry.get(id) ?? 0) + perTick;
    const whole = Math.floor(owed);
    if (whole > 0) addFaith(room, id, whole);
    carry.set(id, owed - whole);
  }
}
