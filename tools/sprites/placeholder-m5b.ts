import { createCanvas } from '@napi-rs/canvas';
import { DIRECTIONS, type Dir } from './keys.ts';
import {
  GLOW_CELL,
  GLOW_FRAMES,
  GLOWS,
  HAND,
  HELD_CELL,
  HELD_FEET,
  MOB_CELL,
  MOB_FEET,
  MOB_PAGE,
  GIVER_PAGE,
  NODE_CELL,
  NODE_GROUND,
  BREAK_FRAMES,
  NODE_STATES,
  RESOURCE_IDS,
  TOOL_IDS,
  glowFrame,
  heldFrame,
  m5bManifest,
  giverAnims,
  giverFrame,
  giverFrameList,
  mobAnims,
  mobFrame,
  mobFrameList,
  nodeAnims,
  nodeBreakFrame,
  nodeFrame,
  packM5b,
  toolAnims,
} from './m5b.ts';
import { inFolder, label, registerFont, shape, type PlaceholderEntry } from './placeholder-kit.ts';

type Frame = { name: string; png: Buffer; pivot: readonly [number, number] };

/** A node: a fog block on the tile's ground point labelled with the resource, or a flat slate patch when spent. */
function nodeFrames(): Frame[] {
  const size = NODE_CELL / 2;
  const [x, y] = [NODE_GROUND[0] / 2, NODE_GROUND[1] / 2];
  return RESOURCE_IDS.flatMap((id) =>
    NODE_STATES.map((state) => {
      const c = createCanvas(size, size);
      const g = c.getContext('2d');
      const tall = state === 'ready' ? 20 : 3;
      shape(g, state === 'ready' ? 'fog' : 'slate', () => {
        g.moveTo(x - 14, y);
        g.lineTo(x, y + 7);
        g.lineTo(x + 14, y);
        g.lineTo(x + 14, y - tall);
        g.lineTo(x - 14, y - tall);
        g.closePath();
      });
      if (state === 'ready') label(g, id.slice(0, 4), x, y - 8, 8);
      return { name: nodeFrame(id, state), png: c.toBuffer('image/png'), pivot: [x, y] as const };
    }).concat(
      // The break: the block sinking from ready to spent height.
      Array.from({ length: BREAK_FRAMES }, (_, n) => {
        const c = createCanvas(size, size);
        const g = c.getContext('2d');
        const tall = 20 - Math.round((17 * n) / (BREAK_FRAMES - 1));
        shape(g, 'fog', () => g.rect(x - 14, y - tall, 28, tall));
        return { name: nodeBreakFrame(id, n), png: c.toBuffer('image/png'), pivot: [x, y] as const };
      }),
    ),
  );
}

/** A held tool: a slate bar through the hand point; a glow: a lantern disc. */
function toolFrames(): Frame[] {
  const size = HELD_CELL / 2;
  const feet = [HELD_FEET[0] / 2, HELD_FEET[1] / 2] as const;
  const held = TOOL_IDS.flatMap((tool) =>
    DIRECTIONS.map((dir) => {
      const c = createCanvas(size, size);
      const g = c.getContext('2d');
      const [hx, hy] = [feet[0] + HAND[dir][0], feet[1] + HAND[dir][1]];
      shape(g, tool === 'lantern' || tool === 'torch' ? 'lantern' : 'slate', () =>
        g.rect(hx - 2, hy - 8, 4, 16),
      );
      return { name: heldFrame(tool, dir), png: c.toBuffer('image/png'), pivot: feet };
    }),
  );
  const half = GLOW_CELL / 2;
  const glows = GLOWS.flatMap((glow) =>
    Array.from({ length: GLOW_FRAMES }, (_, n) => {
      const c = createCanvas(half, half);
      const g = c.getContext('2d');
      shape(g, 'lantern', () => g.arc(half / 2, half / 2, half / 2 - 2 - n, 0, Math.PI * 2), false);
      return { name: glowFrame(glow, n), png: c.toBuffer('image/png'), pivot: [half / 2, half / 2] as const };
    }),
  );
  return [...held, ...glows];
}

/** The screen-frame unit vector of each direction, y down. */
const UNIT: Record<Dir, readonly [number, number]> = {
  n: [0, -1],
  ne: [0.7, -0.7],
  e: [1, 0],
  se: [0.7, 0.7],
  s: [0, 1],
  sw: [-0.7, 0.7],
  w: [-1, 0],
  nw: [-0.7, -0.7],
};

/** A mob: a slate blob over the feet, labelled with the mob id, a fog tick pointing its way; the attack frames a blood tick. */
function mobFrames(): Frame[] {
  const size = MOB_CELL / 2;
  const [fx, fy] = [MOB_FEET[0] / 2, MOB_FEET[1] / 2];
  return mobFrameList().map(([mob, anim, dir, n]) => {
    const c = createCanvas(size, size);
    const g = c.getContext('2d');
    const [rx, ry, up] = mob === 'rat' ? [6, 4, 4] : mob === 'bat' ? [7, 5, 20] : [12, 7, 9];
    const bob = anim === 'walk' ? n % 2 : 0;
    shape(g, 'slate', () => g.ellipse(fx, fy - up - bob, rx, ry, 0, 0, Math.PI * 2));
    const [ux, uy] = UNIT[dir];
    shape(
      g,
      anim === 'attack' ? 'blood' : 'fog',
      () => g.rect(fx + ux * rx - 2, fy - up - bob + uy * ry - 2, 4, 4),
      false,
    );
    label(g, mob, fx, fy - up - ry - 5, 7);
    return { name: mobFrame(mob, anim, dir, n), png: c.toBuffer('image/png'), pivot: [fx, fy] as const };
  });
}

/** A giver: a fog figure with a bone face over the feet, labelled with the npc id, a tick pointing its way. */
function giverFrames(): Frame[] {
  const size = MOB_CELL / 2;
  const [fx, fy] = [MOB_FEET[0] / 2, MOB_FEET[1] / 2];
  return giverFrameList().map(([npc, dir, n]) => {
    const c = createCanvas(size, size);
    const g = c.getContext('2d');
    const br = n % 2;
    shape(g, 'fog', () => g.rect(fx - 7, fy - 34 - br, 14, 34 + br));
    shape(g, 'bone', () => g.arc(fx, fy - 40 - br, 6, 0, Math.PI * 2));
    const [ux, uy] = UNIT[dir];
    shape(g, 'slate', () => g.rect(fx + ux * 5 - 2, fy - 40 - br + uy * 4 - 2, 4, 4), false);
    label(g, npc.slice(0, 6), fx, fy - 10, 7);
    return { name: giverFrame(npc, dir, n), png: c.toBuffer('image/png'), pivot: [fx, fy] as const };
  });
}

/**
 * Round 6, Session 6M (docs/round6/m5b-data.md 4, SPRITES 12): the stand-ins for the M5b art, under the keys
 * of m5b.ts with the same cells and pivots, `order` 80 so they sort after every round-5 module. Mobs and
 * givers share the characters' cell and feet.
 */
export function placeholderEntries(): PlaceholderEntry[] {
  return [
    {
      order: 80,
      entries: m5bManifest('nearest'),
      files: async () => {
        registerFont();
        const files = new Map(await packM5b('nodes', nodeFrames()));
        files.set('nodes.anims.json', Buffer.from(nodeAnims()));
        for (const [k, v] of await packM5b('tools', toolFrames())) files.set(k, v);
        files.set('tools.anims.json', Buffer.from(toolAnims()));
        for (const [k, v] of await packM5b('mobs', mobFrames(), MOB_PAGE)) files.set(k, v);
        files.set('mobs.anims.json', Buffer.from(mobAnims()));
        for (const [k, v] of await packM5b('givers', giverFrames(), GIVER_PAGE)) files.set(k, v);
        files.set('givers.anims.json', Buffer.from(giverAnims()));
        return inFolder('m5b/', files);
      },
    },
  ];
}
