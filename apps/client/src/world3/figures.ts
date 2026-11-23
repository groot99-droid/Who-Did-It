// The figures in the sprite world (round 11, R3; sprite-world.md 1): each Phaser figure view (`PlayerView`) stands
// here as upright billboards, one per art layer, at its feet. The Phaser view still chooses all a figure shows (its
// look, so covers and impersonation draw exactly as today, its clip, frame, overlays, tint and alpha, and its facing
// at the heading, `headingYaw`); this mirror draws that frame in the 3D scene, so walls hide a figure behind them.
// The nameplate and the status marks stay on the Phaser canvas until R5.
import type Phaser from 'phaser';
import {
  type BufferGeometry,
  DoubleSide,
  type Float32BufferAttribute,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Scene,
  SRGBColorSpace,
  Texture,
} from 'three';
import { unitsOfRise, unitsOfWidth } from './frame';

/** What the mirror reads of one figure view (`PlayerView`). */
export interface FigureSource {
  readonly feet: { x: number; y: number } | null;
  readonly hasArt: boolean;
  readonly art: Phaser.GameObjects.Container;
  readonly shadow: Phaser.GameObjects.GameObject & { setVisible(v: boolean): unknown };
  readonly root: Phaser.GameObjects.Container;
}

/** How far each art layer stands in front of the one under it, in scene units (world px): unseen, but no z-fight. */
export const LAYER_STEP = 0.5;

/** The crop of a sprite's frame and where it stands, as `quadOf` reads them (a Phaser `Frame` and `Sprite`). */
export interface LayerFrame {
  cutX: number;
  cutY: number;
  cutWidth: number;
  cutHeight: number;
  realWidth: number;
  realHeight: number;
  /** The crop's offset inside the untrimmed frame (0 when untrimmed). */
  x: number;
  y: number;
  imageWidth: number;
  imageHeight: number;
}

/**
 * The quad of a frame drawn at `scale` screen px per source px, standing on the sprite's origin (`originX`,
 * `originY` of the untrimmed frame, as Phaser draws it); `flipX` mirrors it about the origin, as Phaser does.
 */
export function quadOf(
  f: LayerFrame,
  originX: number,
  originY: number,
  scale: number,
  flipX: boolean,
): { pos: number[]; uv: number[] } {
  const sw = unitsOfWidth(scale);
  const sh = unitsOfRise(scale);
  const ox = originX * f.realWidth - f.x;
  const oy = originY * f.realHeight - f.y;
  let l = -ox * sw;
  let r = (f.cutWidth - ox) * sw;
  if (flipX) [l, r] = [-l, -r];
  const t = oy * sh;
  const b = -(f.cutHeight - oy) * sh;
  const u0 = f.cutX / f.imageWidth;
  const u1 = (f.cutX + f.cutWidth) / f.imageWidth;
  const vt = 1 - f.cutY / f.imageHeight;
  const vb = 1 - (f.cutY + f.cutHeight) / f.imageHeight;
  return { pos: [l, t, 0, r, t, 0, l, b, 0, r, b, 0], uv: [u0, vt, u1, vt, u0, vb, u1, vb] };
}

type Image = HTMLImageElement | HTMLCanvasElement;
interface Layer {
  mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  key: string;
}
interface Drawn {
  group: Group;
  layers: Layer[];
  seen: boolean;
}

const isSprite = (o: Phaser.GameObjects.GameObject): o is Phaser.GameObjects.Sprite => o.type === 'Sprite';

export class FigureMirror {
  private readonly drawn = new Map<FigureSource, Drawn>();
  private readonly textures = new Map<Image, Texture>();

  constructor(private readonly scene: Scene) {}

  /** Draws every figure with art as it stands now, facing the camera at `yaw`; a figure gone is dropped. */
  sync(figures: Iterable<FigureSource>, yaw: number): void {
    for (const d of this.drawn.values()) d.seen = false;
    for (const f of figures) {
      if (!f.hasArt) continue; // a figure without art keeps its capsule on the Phaser canvas
      f.art.setVisible(false);
      f.shadow.setVisible(false);
      let d = this.drawn.get(f);
      if (!d) {
        d = { group: new Group(), layers: [], seen: true };
        this.scene.add(d.group);
        this.drawn.set(f, d);
      }
      d.seen = true;
      const feet = f.feet;
      d.group.visible = feet !== null && f.root.visible;
      if (feet === null || !d.group.visible) continue;
      d.group.position.set(feet.x, 0, feet.y);
      d.group.rotation.y = yaw;
      const alpha = f.root.alpha * f.art.alpha;
      const sprites = f.art.list.filter(isSprite);
      sprites.forEach((s, i) => this.draw(this.layer(d, i), s, f.art.scaleX * s.scaleX, alpha, i));
      for (let i = sprites.length; i < d.layers.length; i++) d.layers[i]!.mesh.visible = false;
    }
    for (const [f, d] of this.drawn) if (!d.seen) this.drop(f, d);
  }

  destroy(): void {
    for (const [f, d] of this.drawn) this.drop(f, d);
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
  }

  private layer(d: Drawn, i: number): Layer {
    let l = d.layers[i];
    if (!l) {
      const mesh = new Mesh(
        new PlaneGeometry(1, 1),
        new MeshBasicMaterial({ alphaTest: 0.5, side: DoubleSide }),
      );
      mesh.position.z = i * LAYER_STEP;
      mesh.renderOrder = i;
      l = { mesh, key: '' };
      d.layers.push(l);
      d.group.add(mesh);
    }
    return l;
  }

  private draw(l: Layer, s: Phaser.GameObjects.Sprite, scale: number, alpha: number, i: number): void {
    const a = alpha * s.alpha;
    l.mesh.visible = s.visible && a > 0;
    if (!l.mesh.visible) return;
    const f = s.frame;
    const image = f.source.image as Image;
    const key = `${f.texture.key}|${f.name}|${scale}|${s.originX}|${s.originY}|${s.flipX}`;
    const mat = l.mesh.material;
    if (key !== l.key) {
      l.key = key;
      const frame: LayerFrame = {
        cutX: f.cutX,
        cutY: f.cutY,
        cutWidth: f.cutWidth,
        cutHeight: f.cutHeight,
        realWidth: f.realWidth, // getters on Phaser's Frame: read one by one, never spread
        realHeight: f.realHeight,
        x: f.x,
        y: f.y,
        imageWidth: image.width,
        imageHeight: image.height,
      };
      const q = quadOf(frame, s.originX, s.originY, scale, s.flipX);
      const g = l.mesh.geometry;
      (g.getAttribute('position') as Float32BufferAttribute).copyArray(q.pos).needsUpdate = true;
      (g.getAttribute('uv') as Float32BufferAttribute).copyArray(q.uv).needsUpdate = true;
      g.computeBoundingSphere(); // frustum culling reads it
      const tex = this.texture(image);
      if (mat.map !== tex) {
        mat.map = tex;
        mat.needsUpdate = true;
      }
    }
    mat.color.setHex(s.tintTopLeft);
    const see = a < 1;
    if (mat.transparent !== see) {
      mat.transparent = see;
      mat.depthWrite = !see;
      mat.needsUpdate = true;
    }
    mat.opacity = a;
    mat.alphaTest = 0.5 * a;
    l.mesh.renderOrder = see ? 10 + i : i;
  }

  private texture(image: Image): Texture {
    let t = this.textures.get(image);
    if (!t) {
      t = new Texture(image);
      t.colorSpace = SRGBColorSpace;
      t.generateMipmaps = false;
      t.minFilter = LinearFilter;
      t.needsUpdate = true;
      this.textures.set(image, t);
    }
    return t;
  }

  private drop(f: FigureSource, d: Drawn): void {
    for (const l of d.layers) {
      l.mesh.geometry.dispose();
      l.mesh.material.dispose();
    }
    d.group.removeFromParent();
    this.drawn.delete(f);
  }
}
