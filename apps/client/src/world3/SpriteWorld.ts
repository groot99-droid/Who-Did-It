// The sprite world in Three.js (round 11, R1; sprite-world.md 1): ground tile planes, boxes and upright billboards
// under an orthographic camera at the isometric pitch. It draws only what `buildScene` lists, which is only what the
// scene's tilemap holds; the figures stand in it (R3), lit by the sun and the lamps of the day part (R4), and every
// live view still draws on the Phaser canvas above it until R5.
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector2,
  WebGLRenderer,
} from 'three';
import { TILE_PX } from '@wdi/shared/constants';
import type { DayPart } from '../view/dayPart';
import type { Rect } from '../view/iso';
import type { FrameArt, TextureSource } from './art';
import type { BillboardNode, BoxNode, SceneBuild } from './build';
import { SILL, cutsView } from './cutaway';
import { FigureMirror, type FigureSource } from './figures';
import { blobRadius } from './light';
import { LightRig } from './lightRig';
import { type MirrorSource, ViewMirror } from './mirror';
import {
  type Heading,
  billboardYaw,
  cameraDirectionAt,
  matchView,
  stepYaw,
  turnHeading,
  unitsOfRise,
  unitsOfWidth,
} from './frame';

/** How far the camera stands back from its target, in scene units: past every scene's far corner. */
const CAMERA_DISTANCE = 20_000;

export class SpriteWorld {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 1, CAMERA_DISTANCE * 2);
  /** R2: the heading snaps at once (input turns with it); the drawn yaw follows it in a quick turn. */
  private heading_: Heading;
  private yaw: number;
  private targetYaw: number;
  private lastFrame = -1;
  private readonly billboards: Object3D[] = [];
  /** R3: the figures, mirrored from the Phaser views each frame. */
  private readonly figureMirror: FigureMirror;
  /** R4: the sun, the ambient, the lamps and the blob shadows. */
  private readonly rig: LightRig;
  private figureSource: (() => Iterable<FigureSource>) | null = null;
  private readonly viewMirror: ViewMirror;
  private viewSource: (() => Iterable<MirrorSource>) | null = null;
  private readonly byId = new Map<string, Object3D>();
  private readonly textures = new Map<object, Texture>();
  private readonly billboardMaterials = new Map<Texture, MeshBasicMaterial>();
  private readonly boxMaterials = new Map<number, MeshLambertMaterial>();
  private readonly unitBox = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  private readonly geometries: BufferGeometry[] = [];
  private readonly size = new Vector2();
  /** The kit walls and their full heights, cut to a sill each frame when they hide the player (R4). */
  private readonly walls: Array<{ mesh: Mesh; box: BoxNode }> = [];

  constructor(
    build: SceneBuild,
    private readonly art: TextureSource,
    heading: Heading = 0,
    private readonly reducedMotion = false,
  ) {
    this.heading_ = heading;
    this.yaw = this.targetYaw = billboardYaw(heading);
    this.rig = new LightRig(this.scene);
    this.figureMirror = new FigureMirror(this.scene, (r) => this.rig.blob(r));
    this.viewMirror = new ViewMirror(this.scene);
    this.renderer = new WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.canvas = this.renderer.domElement;
    this.scene.background = new Color(build.voidColour);
    this.scene.add(this.groundMesh(build));
    for (const n of build.nodes) {
      const o =
        n.kind === 'box'
          ? this.boxMesh(n.w, n.d, n.h, n.colour)
          : n.kind === 'billboard'
            ? this.billboard(n)
            : null;
      if (n.kind === 'box' && n.wall && o instanceof Mesh) this.walls.push({ mesh: o, box: n });
      const obj = o ?? new Object3D();
      obj.name = n.id;
      obj.userData.kind = n.kind;
      obj.position.set(n.x, 0, n.y);
      if (n.kind !== 'mark') obj.visible = !n.hidden;
      this.scene.add(obj);
      this.byId.set(n.id, obj);
    }
  }

  get heading(): Heading {
    return this.heading_;
  }

  /** The yaw drawn now (mid-turn included): the compass reads it. */
  get drawnYaw(): number {
    return this.yaw;
  }

  /** Turns the camera a quarter turn (R2): the heading snaps, the view follows over `TURN_SECONDS`. */
  turn(step: 1 | -1): Heading {
    this.heading_ = turnHeading(this.heading_, step);
    this.targetYaw += (step * Math.PI) / 2;
    return this.heading_;
  }

  /** The figures to draw each frame (R3): the World's figure views. */
  setFigures(source: () => Iterable<FigureSource>): void {
    this.figureSource = source;
  }

  /** The other views to draw each frame (R5): bodies, clues, givers, ... */
  setViews(source: () => Iterable<MirrorSource>): void {
    this.viewSource = source;
  }

  /** Lights the scene for a part of the day (R4): the sun, the ambient and the lamps. */
  setDayPart(part: DayPart): void {
    this.rig.setPart(part);
  }

  /** Shows or hides one node by id (the boarded overlay of a portal). */
  setShown(id: string, shown: boolean): void {
    const o = this.byId.get(id);
    if (o && o.userData.kind !== 'mark') o.visible = shown;
  }

  /**
   * Draws one frame matching the Phaser camera: `view` its world view in screen px, `zoom` its zoom, and the canvas
   * `width` x `height` in CSS px. `cameraId` is that camera's id bit: it skips the views drawn here (R5).
   */
  render(view: Rect, zoom: number, width: number, height: number, cameraId = 0): void {
    const size = this.renderer.getSize(this.size);
    if (size.x !== width || size.y !== height) this.renderer.setSize(width, height, false);
    const now = performance.now();
    const dt = this.lastFrame < 0 ? 0 : Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.yaw !== this.targetYaw) {
      this.yaw = stepYaw(this.yaw, this.targetYaw, dt, this.reducedMotion);
      for (const b of this.billboards) b.rotation.y = this.yaw;
    }
    if (this.figureSource) this.figureMirror.sync(this.figureSource(), this.yaw);
    if (this.viewSource) this.viewMirror.sync(this.viewSource(), this.yaw, cameraId);
    const m = matchView(view, zoom, width, height);
    this.rig.follow(m.target.x, m.target.y, m.halfW, m.halfH);
    for (const { mesh, box } of this.walls)
      mesh.scale.y = cutsView(box, m.target, this.yaw) ? Math.min(SILL, box.h) : box.h;
    const dir = cameraDirectionAt(this.yaw);
    const cam = this.camera;
    cam.left = -m.halfW;
    cam.right = m.halfW;
    cam.top = m.halfH;
    cam.bottom = -m.halfH;
    cam.position.set(
      m.target.x + dir.x * CAMERA_DISTANCE,
      dir.y * CAMERA_DISTANCE,
      m.target.y + dir.z * CAMERA_DISTANCE,
    );
    cam.lookAt(m.target.x, 0, m.target.y);
    cam.updateProjectionMatrix();
    this.renderer.render(this.scene, cam);
  }

  destroy(): void {
    this.figureMirror.destroy();
    this.viewMirror.destroy();
    this.rig.dispose();
    for (const g of this.geometries) g.dispose();
    this.unitBox.dispose();
    for (const m of this.billboardMaterials.values()) m.dispose();
    for (const m of this.boxMaterials.values()) m.dispose();
    for (const t of this.textures.values()) t.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  /** Every ground tile as one quad of one mesh, coloured per vertex. */
  private groundMesh(build: SceneBuild): Mesh {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new Color();
    for (const t of build.ground) {
      const x0 = t.tx * TILE_PX;
      const z0 = t.ty * TILE_PX;
      const x1 = x0 + TILE_PX;
      const z1 = z0 + TILE_PX;
      pos.push(x0, 0, z0, x0, 0, z1, x1, 0, z0, x1, 0, z0, x0, 0, z1, x1, 0, z1);
      c.setHex(t.colour);
      for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.geometries.push(g);
    // The ground lies under everything and writes no depth: art that reaches below its pivot (a prop's footprint
    // diamond) is drawn over it, not clipped by it.
    const mesh = new Mesh(g, new MeshLambertMaterial({ vertexColors: true, depthWrite: false }));
    mesh.receiveShadow = true;
    mesh.name = 'ground';
    mesh.renderOrder = -1;
    return mesh;
  }

  private boxMesh(w: number, d: number, h: number, colour: number): Mesh {
    let mat = this.boxMaterials.get(colour);
    if (!mat) {
      mat = new MeshLambertMaterial({ color: colour });
      this.boxMaterials.set(colour, mat);
    }
    const mesh = new Mesh(this.unitBox, mat);
    mesh.scale.set(w, h, d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * A billboard on its blob shadow. A lantern post (`frameAlt`) holds its lit and its unlit frame and a lamp, and
   * the rig shows the frame of the day part.
   */
  private billboard(n: BillboardNode): Object3D | null {
    const art = this.art(n.atlas, n.frame);
    if (!art) return null;
    const group = new Group();
    const face = (a: FrameArt): Mesh => {
      const mesh = new Mesh(this.plane(a, n.flipX), this.billboardMaterial(a));
      mesh.rotation.y = this.yaw;
      this.billboards.push(mesh);
      group.add(mesh);
      return mesh;
    };
    const lit = face(art);
    group.add(this.rig.blob(blobRadius(unitsOfWidth(art.w * art.scale))));
    if (n.frameAlt !== undefined) {
      const alt = this.art(n.atlas, n.frameAlt);
      const unlit = alt ? face(alt) : null;
      const lamp = this.rig.addLantern(lit, unlit);
      group.add(lamp.light); // the light stands at the post, so it moves and hides with it
    }
    return group;
  }

  /** A plane of the frame's size whose origin is the frame's pivot, with the crop's texture coordinates. */
  private plane(art: FrameArt, flipX: boolean): PlaneGeometry {
    const w = unitsOfWidth(art.w * art.scale);
    const h = unitsOfRise(art.h * art.scale);
    const g = new PlaneGeometry(w, h);
    const ox = flipX ? art.w - art.ox : art.ox;
    g.translate((0.5 - ox / art.w) * w, (art.oy / art.h - 0.5) * h, 0);
    const iw = art.image.width;
    const ih = art.image.height;
    let u0 = art.x / iw;
    let u1 = (art.x + art.w) / iw;
    if (flipX) [u0, u1] = [u1, u0];
    const vt = 1 - art.y / ih;
    const vb = 1 - (art.y + art.h) / ih;
    g.setAttribute('uv', new Float32BufferAttribute([u0, vt, u1, vt, u0, vb, u1, vb], 2));
    this.geometries.push(g);
    return g;
  }

  private billboardMaterial(art: FrameArt): MeshBasicMaterial {
    let tex = this.textures.get(art.image);
    if (!tex) {
      tex = new Texture(art.image);
      tex.colorSpace = SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = LinearFilter;
      tex.needsUpdate = true;
      this.textures.set(art.image, tex);
    }
    let mat = this.billboardMaterials.get(tex);
    if (!mat) {
      mat = new MeshBasicMaterial({ map: tex, alphaTest: 0.5 });
      this.billboardMaterials.set(tex, mat);
    }
    return mat;
  }
}
