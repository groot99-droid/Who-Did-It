// SPRITES 10: the client's half of the isometric contract. The projection itself is `@wdi/shared/iso`; this
// module holds the depth bands, the zoom and camera bounds, and the decal transform. Phaser appears only as a type.
import type Phaser from 'phaser';
import metrics from '@wdi/content/data/metrics.json';
import { TILE_PX } from '@wdi/shared/constants';
import { isoDepth, sceneBounds, toScreen } from '@wdi/shared/iso';

const ISO = metrics.iso;

/** Depth bands (SPRITES 10.6). The y-sorted world lives between 0 and 10 000. */
export const DEPTH = {
  ground: -30,
  blend1: -29,
  blend2: -28,
  decal: -20,
  darkness: 900_000,
  glow: 900_001,
  marks: 950_000,
} as const;

/** Depth bias added to `isoDepth` of the ground anchor (SPRITES 10.6). */
export const BIAS = { kit: 0, overlay: 0.1, floor: 0.25, body: 0.25, character: 0.5 } as const;

/** The depth key of a y-sorted object standing on world point (wx, wy). */
export const depthAt = (wx: number, wy: number, bias: number = BIAS.kit): number => isoDepth(wx, wy) + bias;

/** Camera zoom (SPRITES 10.9): about `viewTilesHigh` tiles high, snapped down to a multiple of `zoomStep`. */
export function isoZoom(height: number): number {
  const steps = Math.floor(height / (ISO.viewTilesHigh * TILE_PX) / ISO.zoomStep + 1e-9);
  return Math.min(2, Math.max(0.5, steps * ISO.zoomStep));
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Camera bounds of a w x h tile scene (SPRITES 10.9): the diamond's box grown by `topPadPx` above and one tile on
 * the other sides, then centred when it is smaller than the view (`viewW` x `viewH` world px at the current zoom).
 */
export function cameraBounds(w: number, h: number, viewW: number, viewH: number): Rect {
  const b = sceneBounds(w, h);
  const x = b.x - TILE_PX;
  const y = b.y - ISO.topPadPx;
  const width = b.width + TILE_PX * 2;
  const height = b.height + ISO.topPadPx + TILE_PX;
  const padX = Math.max(0, (viewW - width) / 2);
  const padY = Math.max(0, (viewH - height) / 2);
  return { x: x - padX, y: y - padY, width: width + padX * 2, height: height + padY * 2 };
}

/**
 * The decal transform (SPRITES 10.5): a container squashed to (1, 0.5) holds a sprite rotated by pi/4 + theta and
 * scaled by sqrt 2, which is the projection itself. `theta` is the decal's world rotation, clockwise from world north.
 */
export function decalTransform(theta = 0): { rotation: number; scale: number; squashY: number } {
  return { rotation: Math.PI / 4 + theta, scale: Math.SQRT2, squashY: 0.5 };
}

/**
 * A holder for ground marks. Children are placed in *world* offsets from (wx, wy) and may carry a world rotation
 * of their own; the holder turns them into their projected look. Returns the inner container to add children to.
 */
export function decalHolder(
  scene: Phaser.Scene,
  wx: number,
  wy: number,
): { root: Phaser.GameObjects.Container; inner: Phaser.GameObjects.Container } {
  const t = decalTransform();
  const s = toScreen(wx, wy);
  const inner = scene.add.container(0, 0).setRotation(t.rotation).setScale(t.scale);
  const root = scene.add.container(s.x, s.y, [inner]).setScale(1, t.squashY);
  return { root, inner };
}

/** The four corners of tile (tx, ty) on screen, top vertex first and clockwise. */
export function tileDiamond(tx: number, ty: number): Array<{ x: number; y: number }> {
  return [
    toScreen(tx * TILE_PX, ty * TILE_PX),
    toScreen((tx + 1) * TILE_PX, ty * TILE_PX),
    toScreen((tx + 1) * TILE_PX, (ty + 1) * TILE_PX),
    toScreen(tx * TILE_PX, (ty + 1) * TILE_PX),
  ];
}

/** The four corners of a w x h tile scene's diamond on screen, top vertex first and clockwise. */
export function sceneDiamond(w: number, h: number): Array<{ x: number; y: number }> {
  return [
    toScreen(0, 0),
    toScreen(w * TILE_PX, 0),
    toScreen(w * TILE_PX, h * TILE_PX),
    toScreen(0, h * TILE_PX),
  ];
}
