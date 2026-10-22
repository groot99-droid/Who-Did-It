import { createCanvas } from '@napi-rs/canvas';
import { DIRECTIONS } from './keys.ts';
import {
  GLOW_CELL,
  GLOW_FRAMES,
  GLOWS,
  HAND,
  HELD_CELL,
  HELD_FEET,
  NODE_CELL,
  NODE_GROUND,
  NODE_STATES,
  RESOURCE_IDS,
  TOOL_IDS,
  glowFrame,
  heldFrame,
  m5bManifest,
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
    }),
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

/**
 * Round 6, Session 6M (docs/round6/m5b-data.md 4, SPRITES 12): the stand-ins for the M5b art, under the keys
 * of m5b.ts with the same cells and pivots, `order` 80 so they sort after every round-5 module. The mobs and
 * the givers join when their ids are fixed (6E steps 2 and 3).
 */
export function placeholderEntries(): PlaceholderEntry[] {
  return [
    {
      order: 80,
      entries: m5bManifest('nearest'),
      files: async () => {
        registerFont();
        const files = new Map(await packM5b('nodes', nodeFrames()));
        for (const [k, v] of await packM5b('tools', toolFrames())) files.set(k, v);
        files.set('tools.anims.json', Buffer.from(toolAnims()));
        return inFolder('m5b/', files);
      },
    },
  ];
}
