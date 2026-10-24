import Phaser from 'phaser';
import { TILE_PX } from '@wdi/shared/constants';
import { ISO_TILE_W } from '@wdi/shared/iso';
import { texelsOf } from './texels';
import { groundColour, materialOfGid, shade, tokenColour } from './greyboxColours';
import { DEPTH, sceneDiamond, tileDiamond } from './iso';
import type { SceneMap } from './sceneMap';

const poly = (pts: Array<{ x: number; y: number }>) => pts.map((p) => new Phaser.Math.Vector2(p.x, p.y));

/**
 * The scene's ground (SPRITES 10.12, 10.13). With the ground tileset loaded it is the three isometric tile layers,
 * `ground`, `blend_1` and `blend_2`. Without it the greybox: one diamond per ground tile, coloured by its material.
 * An orthogonal file, from before the round-5 maps, has no isometric ground to read, so it draws its whole diamond in
 * one flat colour.
 */
export class GroundView {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private tilemap: Phaser.Tilemaps.Tilemap | null = null;

  constructor(scene: Phaser.Scene, mapKey: string, map: SceneMap) {
    const tilesetKey = map.theme === null ? null : `iso_ground_${map.theme}`;
    if (
      map.isometric &&
      tilesetKey !== null &&
      scene.textures.exists(tilesetKey) &&
      scene.cache.tilemap.exists(mapKey)
    ) {
      this.tiled(scene, mapKey, tilesetKey);
    } else if (map.isometric && map.ground.length > 0) {
      this.greybox(scene, map);
    } else {
      this.flat(scene, map);
    }
  }

  private tiled(scene: Phaser.Scene, mapKey: string, tilesetKey: string): void {
    const tm = scene.make.tilemap({ key: mapKey });
    this.tilemap = tm;
    // An HD tileset holds `texels` times larger cells (A164): the map is laid out at that cell and the layers are
    // scaled back, so every tile still covers one 128 x 64 diamond of the world.
    const t = texelsOf(tilesetKey);
    if (t !== 1) tm.setBaseTileSize(ISO_TILE_W * t, TILE_PX * t);
    const set = tm.addTilesetImage(tilesetKey, tilesetKey, ISO_TILE_W * t, TILE_PX * t, 0, 0);
    if (!set) return;
    // Phaser places an isometric tile's image at its left edge; the projection puts the top vertex at x (10.12).
    const layers: Array<[string, number]> = [
      ['ground', DEPTH.ground],
      ['blend_1', DEPTH.blend1],
      ['blend_2', DEPTH.blend2],
    ];
    for (const [name, depth] of layers) {
      const layer = tm.createLayer(name, set, -ISO_TILE_W / 2, 0);
      if (layer) {
        layer.setDepth(depth).setScale(1 / t);
        this.objects.push(layer);
      }
    }
  }

  private greybox(scene: Phaser.Scene, map: SceneMap): void {
    const g = scene.add.graphics().setDepth(DEPTH.ground);
    g.lineStyle(1, tokenColour('ink'), 0.12);
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        const material = materialOfGid(map.ground[ty * map.w + tx] ?? 0);
        if (material === null) continue;
        // A faint chequer keeps single tiles readable on a flat colour.
        g.fillStyle(shade(groundColour(material), (tx + ty) % 2 === 0 ? 1 : 0.94), 1);
        const pts = poly(tileDiamond(tx, ty));
        g.fillPoints(pts, true);
        g.strokePoints(pts, true);
      }
    }
    this.objects.push(g);
  }

  private flat(scene: Phaser.Scene, map: SceneMap): void {
    const g = scene.add.graphics().setDepth(DEPTH.ground);
    g.fillStyle(shade(tokenColour('slate'), 1.3), 1);
    g.fillPoints(poly(sceneDiamond(map.w, map.h)), true);
    this.objects.push(g);
  }

  destroy(): void {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
    this.tilemap?.destroy();
    this.tilemap = null;
  }
}
