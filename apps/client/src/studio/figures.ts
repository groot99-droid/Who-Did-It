// Round 9 (9T): the Studio snapshot as the roster rows and avatars the world views read. No Phaser, so it is tested.
import type { StudioSnapshot } from '../admin/StudioNet';
import type { AvatarSnap, PlayerSnap } from '../net/world';
import { AnimId } from '../view/animIds';

export const FIGURE_ID = 'studio-figure';
/** The look the admin figure walks as: the village figure every non-seat uses. */
export const FIGURE_LOOK = 'villager';

const player = (id: string, name: string, look: string): PlayerSnap => ({
  id,
  name,
  traits: { height: 1, scarf: 0, hat: 2 },
  alive: true,
  look,
  presence: null,
});

export interface StudioFigures {
  players: PlayerSnap[];
  avatars: AvatarSnap[];
  /** Stand-ins with no character (mobs, townsfolk): drawn as labelled markers by the scene. */
  markers: Array<{ id: string; label: string; x: number; y: number }>;
}

export function figuresOf(s: StudioSnapshot): StudioFigures {
  const players = [player(FIGURE_ID, 'You', FIGURE_LOOK)];
  const avatars: AvatarSnap[] = [
    {
      handle: FIGURE_ID,
      lookOf: FIGURE_ID,
      height: 1,
      x: s.x,
      y: s.y,
      yaw: s.yaw,
      animId: s.moving ? AnimId.walk : AnimId.idle,
      statusBits: 0,
      transitUntilTick: 0,
    },
  ];
  const markers: StudioFigures['markers'] = [];
  for (const sp of s.spawns) {
    // Its feet, not its tile: the server steps a stand-in every tick, so the figure glides between tiles.
    const x = sp.px;
    const y = sp.py;
    if (sp.kind === 'look') {
      players.push(player(sp.id, sp.ref, sp.ref));
      avatars.push({
        handle: sp.id,
        lookOf: sp.id,
        height: 1,
        x,
        y,
        yaw: sp.yaw,
        animId: sp.moving ? AnimId.walk : AnimId.idle,
        statusBits: 0,
        transitUntilTick: 0,
      });
    } else {
      markers.push({ id: sp.id, label: `${sp.kind} ${sp.ref}`, x, y });
    }
  }
  return { players, avatars, markers };
}
