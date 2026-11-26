// The views in the sprite world (round 11, R5): a Phaser view (a body, a clue, a creature, ...) still chooses all it
// shows; this draws its sprites, discs and plain quads in the 3D scene at its root's ground point, so it stands right
// at every heading and walls hide it. The Phaser camera skips a mirrored root (`cameraFilter`). A root with a part the
// mirror cannot draw (a text, a `Graphics`) stays on the Phaser canvas at its heading-0 place, as before R5.
import type Phaser from 'phaser';
import { toWorld } from '@wdi/shared/iso';
import {
  type BufferGeometry,
  CircleGeometry,
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
import { LAYER_STEP, type LayerFrame, quadOf } from './figures';
import { PX_PER_UNIT, RISE_PX_PER_UNIT, unitsOfRise, unitsOfWidth } from './frame';

/**
 * How a view's root is drawn. `upright`: its parts stand as billboards over the root's ground point. `decal`: the root
 * is a `decalHolder` (view/iso.ts), and its parts lie flat on the ground at their world offsets and rotations (R5b).
 */
export type MirrorKind = 'upright' | 'decal';

export interface MirrorSource {
  readonly obj: Phaser.GameObjects.GameObject;
  readonly kind: MirrorKind;
}

/** How high a part lying on the ground (a shadow) lies above it, and each over the last, in scene units. */
export const DECAL_LIFT = 0.3;
const DECAL_STEP = 0.02;

type Image = HTMLImageElement | HTMLCanvasElement;
/** The Phaser game object fields the mirror reads; a part is told apart by its `type`. */
interface Part {
  type: string;
  visible: boolean;
  alpha: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  list?: Part[];
  frame?: Phaser.Textures.Frame;
  originX?: number;
  originY?: number;
  flipX?: boolean;
  tintTopLeft?: number;
  width?: number;
  height?: number;
  radius?: number;
  fillColor?: number;
  fillAlpha?: number;
  isFilled?: boolean;
  cameraFilter: number;
}

/**
 * One thing to draw: a frame quad, a disc or a plain quad. `world`: its offset, size and rotation are world px (a
 * decal's part); else its offset is screen px from the root. `flat`: it lies on the ground (a decal's part, a shadow).
 */
export type Prim = { x: number; y: number; alpha: number; flat: boolean; world: boolean } & (
  | { kind: 'frame'; part: Part; scale: number; rotation: number }
  | { kind: 'disc'; rx: number; ry: number; colour: number }
  | { kind: 'rect'; w: number; h: number; colour: number }
);

const FRAMED = new Set(['Sprite', 'Image']);

/** The parts a root shows, flattened to offsets in screen px and scales; null when one is a part it cannot draw. */
export function primsOf(obj: Phaser.GameObjects.GameObject, kind: MirrorKind): Prim[] | null {
  const out: Prim[] = [];
  const root = obj as unknown as Part;
  if (kind === 'decal') {
    // decalHolder: the root (squashed 1 x 0.5) > inner (pi/4 and sqrt 2: the projection) > parts at world offsets.
    const inner = root.list?.[0];
    if (!inner?.list) return null;
    for (const p of inner.list)
      if (!add(out, p, p.x, p.y, p.scaleX, root.alpha * inner.alpha, p.rotation || 0)) return null;
    return out;
  }
  if (root.list) {
    if (!walk(out, root.list, 0, 0, root.scaleX, root.scaleY, root.alpha)) return null;
  } else if (!add(out, root, 0, 0, root.scaleX, 1)) return null;
  return out;
}

function walk(out: Prim[], list: Part[], ox: number, oy: number, sx: number, sy: number, a: number): boolean {
  for (const p of list) {
    const [x, y] = [ox + p.x * sx, oy + p.y * sy];
    if (!p.list) {
      if (!add(out, p, x, y, sx * p.scaleX, a)) return false;
    } else if (p.visible && !walk(out, p.list, x, y, sx * p.scaleX, sy * p.scaleY, a * p.alpha)) return false;
  }
  return true;
}

/** Adds part `p` at offset (x, y); a `rotation` (a world one) makes it a decal's part, flat on the ground. */
function add(
  out: Prim[],
  p: Part,
  x: number,
  y: number,
  scale: number,
  alpha: number,
  rotation?: number,
): boolean {
  if (!p.visible) return true;
  const world = rotation !== undefined;
  const at = { x, y, alpha: alpha * p.alpha, flat: world, world };
  const fill = { colour: p.fillColor!, alpha: at.alpha * p.fillAlpha! };
  if (FRAMED.has(p.type)) out.push({ ...at, kind: 'frame', part: p, scale, rotation: rotation ?? 0 });
  else if (p.type === 'Ellipse' || p.type === 'Arc') {
    const [rx, ry] = p.type === 'Arc' ? [p.radius!, p.radius!] : [p.width! / 2, p.height! / 2];
    // Standing, an ellipse half as tall as it is wide is a ground circle seen at the pitch: a shadow.
    const ground = !world && p.type === 'Ellipse' && Math.abs(2 * ry - rx) < 0.5;
    if (p.isFilled !== false)
      out.push({ ...at, ...fill, kind: 'disc', rx: rx * scale, ry: ry * scale, flat: world || ground });
  } else if (p.type === 'Rectangle') {
    if (p.isFilled !== false)
      out.push({ ...at, ...fill, kind: 'rect', w: p.width! * scale, h: p.height! * scale });
  } else return false;
  return true;
}

/** A disc's radii or a plain quad's size, in scene units. */
function sizeOf(p: Exclude<Prim, { kind: 'frame' }>): [number, number] {
  const [w, h] = p.kind === 'disc' ? [p.rx, p.ry] : [p.w, p.h];
  if (p.world) return [w, h];
  // A shadow: the world circle whose screen half-width is `rx` (toScreen widens a world length by PX_PER_UNIT).
  if (p.flat) return [w / PX_PER_UNIT, w / PX_PER_UNIT];
  return [unitsOfWidth(w), unitsOfRise(h)];
}

type Slot = { kind: Prim['kind']; mesh: Mesh<BufferGeometry, MeshBasicMaterial>; key: string };
type Drawn = { group: Group; slots: Slot[]; seen: boolean };

export class ViewMirror {
  private readonly drawn = new Map<Phaser.GameObjects.GameObject, Drawn>();
  private readonly textures = new Map<Image, Texture>();
  private readonly disc = new CircleGeometry(1, 24);
  private readonly square = new PlaneGeometry(1, 1);

  constructor(private readonly scene: Scene) {}

  /** Draws every source as it stands now, facing a camera at `yaw`; the Phaser camera `cameraId` skips what is drawn. */
  sync(sources: Iterable<MirrorSource>, yaw: number, cameraId: number): void {
    for (const d of this.drawn.values()) d.seen = false;
    for (const { obj, kind } of sources) {
      const root = obj as unknown as Part;
      const prims = root.visible ? primsOf(obj, kind) : [];
      if (prims === null) {
        root.cameraFilter &= ~cameraId; // left on the Phaser canvas
        continue;
      }
      root.cameraFilter |= cameraId;
      let d = this.drawn.get(obj);
      if (!d) {
        d = { group: new Group(), slots: [], seen: true };
        this.scene.add(d.group);
        this.drawn.set(obj, d);
      }
      d.seen = true;
      const at = toWorld(root.x, root.y);
      d.group.position.set(at.x, 0, at.y);
      prims.forEach((p, i) => this.draw(d, i, p, yaw));
      for (let i = prims.length; i < d.slots.length; i++) d.slots[i]!.mesh.visible = false;
    }
    for (const [o, d] of this.drawn) if (!d.seen) this.drop(o, d);
  }

  destroy(): void {
    for (const [o, d] of this.drawn) this.drop(o, d);
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
    this.disc.dispose();
    this.square.dispose();
  }

  private slot(d: Drawn, i: number, kind: Prim['kind']): Slot {
    let s = d.slots[i];
    if (s && s.kind !== kind) {
      if (s.kind === 'frame') s.mesh.geometry.dispose();
      s.mesh.material.dispose();
      s.mesh.removeFromParent();
      s = undefined;
    }
    if (!s) {
      const geometry = kind === 'frame' ? new PlaneGeometry(1, 1) : kind === 'disc' ? this.disc : this.square;
      const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
      s = { kind, mesh, key: '' };
      d.slots[i] = s;
      d.group.add(mesh);
    }
    return s;
  }

  private draw(d: Drawn, i: number, p: Prim, yaw: number): void {
    const s = this.slot(d, i, p.kind);
    const m = s.mesh;
    m.visible = p.alpha > 0;
    if (!m.visible) return;
    if (p.flat) {
      // Lying face up: its up is world north and its right world east; a world rotation turns it clockwise.
      const at = p.world ? p : toWorld(p.x, p.y);
      m.position.set(at.x, DECAL_LIFT + i * DECAL_STEP, at.y);
      m.rotation.set(-Math.PI / 2, 0, p.kind === 'frame' ? -p.rotation : 0);
    } else {
      // Standing, facing the camera: x across the screen, y up, each part a step nearer the camera than the last.
      const across = unitsOfWidth(p.x);
      const step = i * LAYER_STEP;
      m.position.set(
        across * Math.cos(yaw) + step * Math.sin(yaw),
        unitsOfRise(-p.y),
        -across * Math.sin(yaw) + step * Math.cos(yaw),
      );
      m.rotation.set(0, yaw, 0);
    }
    const mat = m.material;
    if (p.kind === 'frame') this.frameQuad(s, p);
    else {
      m.scale.set(...sizeOf(p), 1);
      mat.color.setHex(p.colour);
    }
    const see = p.alpha < 1 || p.kind !== 'frame';
    if (mat.transparent !== see) {
      mat.transparent = see;
      mat.depthWrite = !see;
      mat.needsUpdate = true;
    }
    mat.opacity = p.alpha;
    mat.alphaTest = p.kind === 'frame' ? 0.5 * p.alpha : 0;
    m.renderOrder = p.flat ? -0.4 : see ? 10 + i : i;
  }

  private frameQuad(s: Slot, p: Extract<Prim, { kind: 'frame' }>): void {
    const part = p.part;
    const f = part.frame!;
    const image = f.source.image as Image;
    const key = `${f.texture.key}|${f.name}|${p.scale}|${part.originX}|${part.originY}|${part.flipX}`;
    const mat = s.mesh.material;
    mat.color.setHex(part.tintTopLeft ?? 0xffffff);
    if (key === s.key) return;
    s.key = key;
    const frame: LayerFrame = {
      cutX: f.cutX,
      cutY: f.cutY,
      cutWidth: f.cutWidth,
      cutHeight: f.cutHeight,
      realWidth: f.realWidth,
      realHeight: f.realHeight,
      x: f.x,
      y: f.y,
      imageWidth: image.width,
      imageHeight: image.height,
    };
    const q = quadOf(frame, part.originX ?? 0.5, part.originY ?? 0.5, p.scale, part.flipX === true);
    // A decal's quad is in world px: undo quadOf's screen-to-scene scaling (the mesh's rotation lays it down).
    const pos = p.world ? q.pos.map((v, i) => v * (i % 3 === 0 ? PX_PER_UNIT : RISE_PX_PER_UNIT)) : q.pos;
    const g = s.mesh.geometry;
    (g.getAttribute('position') as Float32BufferAttribute).copyArray(pos).needsUpdate = true;
    (g.getAttribute('uv') as Float32BufferAttribute).copyArray(q.uv).needsUpdate = true;
    g.computeBoundingSphere();
    const tex = this.texture(image);
    if (mat.map !== tex) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
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

  private drop(o: Phaser.GameObjects.GameObject, d: Drawn): void {
    for (const s of d.slots) {
      if (s.kind === 'frame') s.mesh.geometry.dispose();
      s.mesh.material.dispose();
    }
    d.group.removeFromParent();
    this.drawn.delete(o);
  }
}
