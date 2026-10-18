import type { AvatarSnap } from '../net/world';
import { StatusBit } from './animIds';

// Targets for the verbs that name an avatar (GDD 3.17): the Kill and the Bandage send a handle, never a seat id.

/**
 * The handle of the avatar nearest to the viewer's own within `rangePx`, or null: never the own avatar, never a
 * figure in transit (the server refuses a strike on it) or ghost, and the first of two equally near ones in list order.
 * The own position is the own avatar's, which `WorldFeed.avatars()` always holds.
 */
export function nearestAvatar(avatars: readonly AvatarSnap[], self: string, rangePx: number): string | null {
  const me = avatars.find((a) => a.handle === self);
  if (!me) return null;
  let best: string | null = null;
  let bestD = rangePx;
  for (const a of avatars) {
    if (a.handle === self || (a.statusBits & (StatusBit.transit | StatusBit.ghost)) !== 0) continue;
    const d = Math.hypot(a.x - me.x, a.y - me.y);
    if (d <= bestD) {
      bestD = d;
      best = a.handle;
    }
  }
  return best;
}
