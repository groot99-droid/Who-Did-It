// The sprite world in Three.js (round 11, R1; sprite-world.md 1): ground tile planes, boxes and upright billboards
// under an orthographic camera at the isometric pitch. It draws only what `buildScene` lists, which is only what the
// scene's tilemap holds; the figures and every live view still draw on the Phaser canvas above it until R3 and R5.
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
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
import type { Rect } from '../view/iso';
import type { FrameArt, TextureSource } from './art';
import type { BillboardNode, SceneBuild } from './build';
import { type Heading, billboardYaw, cameraDirection, matchView, unitsOfRise, unitsOfWidth } from './frame';

/** How far the camera stands back from its target, in scene units: past every scene's far corner. */
const CAMERA_DISTANCE = 20_000;

export class SpriteWorld {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 1, CAMERA_DISTANCE * 2);
  private readonly heading: Heading = 0;
  private readonly byId = new Map<string, Object3D>();
  private readonly textures = new Map<object, Texture>();
  private readonly billboardMaterials = new Map<Texture, MeshBasicMaterial>();
  private readonly boxMaterials = new Map<number, MeshLambertMaterial>();
  private readonly unitBox = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  private readonly geometries: BufferGeometry[] = [];
  private readonly size = new Vector2();

  constructor(
    build: SceneBuild,
    private readonly art: TextureSource,
  ) {
    this.renderer = new WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.canvas = this.renderer.domElement;
    this.scene.background = new Color(build.voidColour);
    // R4 replaces this light with the sun and the lamps of the day part.
    this.scene.add(new AmbientLight(0xffffff, 1.6));
    const key = new DirectionalLight(0xffffff, 1.4);
    key.position.set(-0.4, 1, 0.8);
    this.scene.add(key);
    this.scene.add(this.groundMesh(build));
    for (const n of build.nodes) {
      const o =
        n.kind === 'box'
          ? this.boxMesh(n.w, n.d, n.h, n.colour)
          : n.kind === 'billboard'
            ? this.billboard(n)
            : null;
      const obj = o ?? new Object3D();
      obj.name = n.id;
      obj.userData.kind = n.kind;
      obj.position.set(n.x, 0, n.y);
      if (n.kind !== 'mark') obj.visible = !n.hidden;
      this.scene.add(obj);
      this.byId.set(n.id, obj);
    }
  }

  /** Shows or hides one node by id (the boarded overlay of a portal). */
  setShown(id: string, shown: boolean): void {
    const o = this.byId.get(id);
    if (o && o.userData.kind !== 'mark') o.visible = shown;
  }

  /**
   * Draws one frame matching the Phaser camera: `view` its world view in screen px, `zoom` its zoom, and the canvas
   * `width` x `height` in CSS px.
   */
  render(view: Rect, zoom: number, width: number, height: number): void {
    const size = this.renderer.getSize(this.size);
    if (size.x !== width || size.y !== height) this.renderer.setSize(width, height, false);
    const m = matchView(view, zoom, width, height);
    const dir = cameraDirection(this.heading);
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
    return mesh;
  }

  private billboard(n: BillboardNode): Object3D | null {
    const art = this.art(n.atlas, n.frame);
    if (!art) return null;
    const mesh = new Mesh(this.plane(art, n.flipX), this.billboardMaterial(art));
    mesh.rotation.y = billboardYaw(this.heading);
    return mesh;
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
