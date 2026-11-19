// The sprite world's one texture source (round 11, R1). Until the look gate the figures and props are today's packed
// atlases, read from the textures Phaser has loaded; 11F and 11P bring the new art later by replacing this function.
import type Phaser from 'phaser';
import metrics from '@wdi/content/data/metrics.json';
import { drawScale } from '../view/texels';

/** One frame's pixels: its crop of a source image, its ground point inside the crop, and its screen px per pixel. */
export interface FrameArt {
  image: HTMLImageElement | HTMLCanvasElement | ImageBitmap;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The pivot (the ground point, SPRITES 10.5) in px from the crop's top-left corner. */
  ox: number;
  oy: number;
  /** Screen px one source px covers (`drawScale`, with the HD texel factor). */
  scale: number;
}

export type TextureSource = (atlas: string, frame: string) => FrameArt | null;

/**
 * Frames of the atlases Phaser has loaded. A frame with its own pivot stands on it; one without stands on its bottom
 * edge, as in `StaticView`. A trimmed frame's pivot is moved into its crop.
 */
export function phaserArt(textures: Phaser.Textures.TextureManager): TextureSource {
  return (atlas, frame) => {
    if (!textures.exists(atlas)) return null;
    const t = textures.get(atlas);
    if (!t.has(frame)) return null;
    const f = t.get(frame);
    const px = f.customPivot ? f.pivotX : 0.5;
    const py = f.customPivot ? f.pivotY : 1;
    return {
      image: f.source.image as HTMLImageElement | HTMLCanvasElement,
      x: f.cutX,
      y: f.cutY,
      w: f.cutWidth,
      h: f.cutHeight,
      // `x` and `y` are the crop's offset inside the untrimmed frame (0 when untrimmed).
      ox: px * f.realWidth - f.x,
      oy: py * f.realHeight - f.y,
      scale: drawScale(atlas, metrics.iso.artScale),
    };
  };
}
