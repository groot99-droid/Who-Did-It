import { balance, relations } from '@wdi/content';
import type { AvatarState, InspectHealth, InspectPurse, PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { hpOf } from '../mobs/hurt';

// What the eye reads of an avatar (GDD 3.22 "Inspect", docs/round8/body.md 7), Session 8B. The signs come only from
// the avatar's public status bits, so a cover-wearer and a true wearer of a look read alike; the health and purse
// are bands, never numbers.

/**
 * Status bit -> sign copy id (`ui/copy/inspect.ts`), in the order the card lists them. The values are the bits of
 * seams.md 2 (8A appends the names to `StatusBit`); a bit that nothing sets yet reads nothing.
 */
export const SIGN_OF_BIT: readonly (readonly [number, string])[] = [
  [1024, 'inspect.sign.down'],
  [256, 'inspect.sign.stunned'],
  [512, 'inspect.sign.dazed'],
  [2, 'inspect.sign.bloody'],
  [32, 'inspect.sign.bleeding'],
  [16, 'inspect.sign.limping'],
  [64, 'inspect.sign.pale'],
  [128, 'inspect.sign.weary'],
];

/** `StatusBit.lantern` (GDD 3.15): a light burns in hand. */
const LANTERN_BIT = 8;

/**
 * Effect id -> sign copy id for the effects that have no status bit and show only to a close look (body.md 6:
 * Weakened, Famished and 8D's Indebted, "a hunted look"). The ids are seams.md 2's; read from 8A's `Private.body`
 * once it exists.
 */
export const SIGN_OF_EFFECT: readonly (readonly [number, string])[] = [
  [4, 'inspect.sign.weak'],
  [9, 'inspect.sign.hungry'],
  [11, 'inspect.sign.hunted'],
];

/** The avatar's signs: its public bits, then the close-look effects of the seat behind it. */
export function signsOf(avatar: AvatarState, player: PlayerState | undefined): string[] {
  const shown = avatar.statusBits | avatar.nearBits; // round 8, 8L: Blood rides `nearBits`
  const bits = SIGN_OF_BIT.filter(([bit]) => (shown & bit) !== 0).map(([, id]) => id);
  const body = (player?.priv as { body?: { effects?: Iterable<{ id: number }> } } | undefined)?.body;
  const on = new Set<number>();
  for (const effect of body?.effects ?? []) on.add(effect.id);
  return [...bits, ...SIGN_OF_EFFECT.filter(([id]) => on.has(id)).map(([, sign]) => sign)];
}

export const lightOf = (avatar: AvatarState): boolean => (avatar.statusBits & LANTERN_BIT) !== 0;

/** The seat's health as a fraction of its whole (8A's body, `balance.body`: the line 8B left to change). */
function healthFraction(room: PartyRoom, seat: string): number {
  return hpOf(room, seat) / Math.max(1, balance.body.maxHp);
}

export function healthBand(room: PartyRoom, seat: string): InspectHealth {
  const f = healthFraction(room, seat);
  const floors = relations.inspect.health;
  return f >= floors.unhurt ? 'unhurt' : f >= floors.bruised ? 'bruised' : 'badlyHurt';
}

/** The purse's jingle: `unknown` until 8C's `Private.purse` exists and `inspect.purse` sets the bands. */
export function purseBand(player: PlayerState): InspectPurse {
  const bands = relations.inspect.purse;
  const purse = (player.priv as { purse?: unknown } | undefined)?.purse;
  if (!bands || typeof purse !== 'number') return 'unknown';
  return purse >= bands.heavy ? 'heavy' : purse >= bands.fair ? 'fair' : 'light';
}
