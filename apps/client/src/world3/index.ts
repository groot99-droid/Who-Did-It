// The sprite world's entry (round 11, R1; DECISIONS A618). Reached only by the World scene's dynamic `import()` behind
// `?render=sprite`, so a default load never fetches Three.js. It lays its canvas under the Phaser canvas, which keeps
// drawing the figures and every view R5 has not ported yet, and the DOM overlay HUD above both.
import type Phaser from 'phaser';
import type { SceneMap, TiledMap } from '../view/sceneMap';
import type { StaticDef } from '../view/statics';
import { phaserArt } from './art';
import { buildScene, readSpawns } from './build';
import { SpriteWorld } from './SpriteWorld';

export interface SpriteWorldHandle {
  /** Draws a frame matching the Phaser camera; call once per World update. */
  frame(cam: Phaser.Cameras.Scene2D.Camera): void;
  setShown(id: string, shown: boolean): void;
  setHidden(hidden: boolean): void;
  destroy(): void;
}

export function mountSpriteWorld(
  under: HTMLCanvasElement,
  textures: Phaser.Textures.TextureManager,
  map: SceneMap,
  tiled: TiledMap,
  defs: StaticDef[],
): SpriteWorldHandle {
  const art = phaserArt(textures);
  const world = new SpriteWorld(
    buildScene(map, readSpawns(tiled), defs, (atlas, frame) => art(atlas, frame) !== null),
    art,
  );
  const canvas = world.canvas;
  const before = { position: under.style.position, zIndex: under.style.zIndex };
  under.style.position = 'relative';
  under.style.zIndex = '1';
  canvas.style.position = 'absolute';
  canvas.style.zIndex = '0';
  canvas.style.pointerEvents = 'none';
  under.parentElement?.insertBefore(canvas, under);
  return {
    frame(cam) {
      canvas.style.left = `${under.offsetLeft}px`;
      canvas.style.top = `${under.offsetTop}px`;
      canvas.style.width = `${under.clientWidth}px`;
      canvas.style.height = `${under.clientHeight}px`;
      world.render(cam.worldView, cam.zoom, under.clientWidth, under.clientHeight);
    },
    setShown: (id, shown) => world.setShown(id, shown),
    setHidden(hidden) {
      canvas.style.visibility = hidden ? 'hidden' : '';
    },
    destroy() {
      world.destroy();
      under.style.position = before.position;
      under.style.zIndex = before.zIndex;
    },
  };
}
