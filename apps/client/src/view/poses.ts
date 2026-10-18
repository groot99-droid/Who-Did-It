// The pure side of `PlayerView.pose` (SPRITES 10.4, docs/round5/npc.md 4): which clip a presence animation id plays,
// and which atlas direction a yaw faces. Kept apart from Phaser so it is tested.
import type { Direction } from '@wdi/shared/direction';
import { screenDirOfYaw } from '@wdi/shared/iso';
import { AnimId } from './animIds';

/** Atlas direction (screen frame) of the server's yaw (radians clockwise from world north; SPRITES 10.4). */
export const dirFromYaw = (yaw: number): Direction => screenDirOfYaw(yaw);

export type Clip = 'idle' | 'walk' | 'swing' | 'die' | 'interact';

/**
 * The clip for `animId`. A look without an `interact` clip plays `idle`, and `tick` asks the greybox to mark the hold
 * with a small teal tick above the head instead (npc.md 4).
 */
export function clipFor(animId: number, has: (clip: Clip) => boolean): { clip: Clip; tick: boolean } {
  switch (animId) {
    case AnimId.walk:
      return { clip: 'walk', tick: false };
    case AnimId.swing:
      return { clip: 'swing', tick: false };
    case AnimId.die:
      return { clip: 'die', tick: false };
    case AnimId.interact:
      return has('interact') ? { clip: 'interact', tick: false } : { clip: 'idle', tick: true };
    default:
      return { clip: 'idle', tick: false };
  }
}
