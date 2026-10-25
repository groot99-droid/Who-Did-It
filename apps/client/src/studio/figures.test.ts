import { describe, expect, it } from 'vitest';
import type { StudioSnapshot } from '../admin/StudioNet';
import { AnimId } from '../view/animIds';
import { figuresOf, FIGURE_ID } from './figures';

const base: StudioSnapshot = {
  tick: 1,
  sceneId: 'bakery',
  profile: 'large',
  x: 50,
  y: 60,
  tx: 1,
  ty: 1,
  yaw: 1.5,
  moving: true,
  noclip: false,
  scale: 1,
  paused: false,
  time: { phase: 'day', t: 0.5 },
  spawns: [],
  items: [],
};

describe('figuresOf', () => {
  it('draws the admin figure at its feet, walking when it moves', () => {
    const f = figuresOf(base);
    expect(f.avatars).toHaveLength(1);
    expect(f.avatars[0]).toMatchObject({ handle: FIGURE_ID, x: 50, y: 60, yaw: 1.5, animId: AnimId.walk });
    expect(figuresOf({ ...base, moving: false }).avatars[0]?.animId).toBe(AnimId.idle);
  });

  it('draws a look stand-in as a figure on its tile centre and a mob as a marker', () => {
    const f = figuresOf({
      ...base,
      spawns: [
        {
          id: 's1',
          kind: 'look',
          ref: 'baker',
          x: 2,
          y: 3,
          px: 80,
          py: 112,
          yaw: 0,
          moving: false,
          state: 'stand',
        },
        {
          id: 's2',
          kind: 'mob',
          ref: 'wolf',
          x: 4,
          y: 5,
          px: 144,
          py: 176,
          yaw: 0,
          moving: false,
          state: 'idle',
        },
      ],
    });
    expect(f.avatars.map((a) => a.handle)).toEqual([FIGURE_ID, 's1']);
    expect(f.avatars[1]).toMatchObject({ x: 80, y: 112, animId: AnimId.idle });
    expect(f.players.find((p) => p.id === 's1')?.look).toBe('baker');
    expect(f.markers).toEqual([{ id: 's2', label: 'mob wolf', x: 144, y: 176 }]);
  });
});
