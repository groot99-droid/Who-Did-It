import abilitiesJson from '@wdi/content/data/abilities.json';
import { TILE_PX } from '@wdi/shared/constants';
import type { AvatarSnap, MobSnap } from '../../net/world';
import { MobWireState } from '../m5bFrames';
import { nearestAvatar } from '../targets';

// The client side of the body's verbs (round 8, 8A; GDD 3.22; UI.md 14.32): where the strike key aims, and which
// pocket rows offer a Use button. The server resolves and refuses; this only picks what to name.

type AbilityRow = {
  kind: string;
  scope: string;
  target: string;
  rangeTiles?: number;
  consumes?: string;
  requires?: string;
};
const ABILITIES = abilitiesJson.abilities as unknown as Record<string, AbilityRow>;

/** The fists' reach in tiles (`abilities.json` `strike`). */
export const STRIKE_RANGE_TILES = ABILITIES.strike?.rangeTiles ?? 1;

/** A target may have moved since the last patch; the server adds the same slack from its ring (as `scenes/World.ts`). */
const TARGET_SLACK_TILES = 1;

/** A verb's reach in pixels with the targeting slack. */
export const reachPx = (rangeTiles: number): number => (rangeTiles + TARGET_SLACK_TILES) * TILE_PX;

/**
 * What X strikes: the nearest other avatar in reach (a handle, as the Kill names it), else the nearest living
 * creature in reach (its id); null with nothing in reach. A dead creature is no target (GDD 3.22), and the own
 * position is the own avatar's, which the feed always holds.
 */
export function strikeTarget(
  avatars: readonly AvatarSnap[],
  self: string,
  mobs: readonly MobSnap[],
  rangePx: number,
): string | null {
  const near = nearestAvatar(avatars, self, rangePx);
  if (near !== null) return near;
  const me = avatars.find((a) => a.handle === self);
  if (!me) return null;
  let best: string | null = null;
  let bestD = rangePx;
  for (const m of mobs) {
    if (m.state === MobWireState.dead) continue;
    const d = Math.hypot(m.x - me.x, m.y - me.y);
    if (d <= bestD) {
      bestD = d;
      best = m.id;
    }
  }
  return best;
}

export interface UseVerb {
  /** The ability the Use button sends (`act.ability`). */
  id: string;
  /** `self` for a food; `player` for a cure that also works on a seat in reach. */
  target: 'self' | 'player';
  rangeTiles: number;
}

/**
 * The verb a pocket row's Use button sends, or null for an item without one: an active ability any holder may use
 * (`scope` item or universal) that consumes or requires the item (the Medkit's `heal`, the Remedy's `antidote`, a
 * food's `eat`). A role's own item verbs (the Bandage, the Salts, the slingshot) are keys of the card, not buttons.
 */
export function useVerbOf(itemId: string): UseVerb | null {
  for (const [id, a] of Object.entries(ABILITIES)) {
    if (a.kind !== 'active' || (a.scope !== 'item' && a.scope !== 'universal')) continue;
    if (a.consumes !== itemId && a.requires !== itemId) continue;
    return { id, target: a.target === 'self' ? 'self' : 'player', rangeTiles: a.rangeTiles ?? 0 };
  }
  return null;
}
