// The sprite world's lights (round 11, R4): the sun that casts the shadow maps, the ambient, a point light per lantern
// post, and the blob shadows that stand under billboards (a billboard faces the camera, so it casts no shadow of its
// own). `light.ts` holds the numbers.
import {
  AmbientLight,
  CircleGeometry,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PointLight,
  type Scene,
} from 'three';
import type { DayPart } from '../view/dayPart';
import { BLOB_OPACITY, LAMP, lightingOf, sunDirection } from './light';

/** How far the sun stands from the ground point it lights, in scene units. */
const SUN_DISTANCE = 4000;
/** The shadow map's size in texels, each side. */
const SHADOW_MAP_PX = 2048;

/** A lantern post: its point light, and its lit and unlit billboards (either may be missing). */
export interface Lantern {
  light: PointLight;
  lit: Object3D | null;
  unlit: Object3D | null;
}

export class LightRig {
  readonly sun = new DirectionalLight();
  readonly ambient = new AmbientLight();
  readonly lanterns: Lantern[] = [];
  private part: DayPart = 'day';
  private readonly blobGeometry = new CircleGeometry(1, 24).rotateX(-Math.PI / 2);
  private readonly blobMaterial = new MeshBasicMaterial({
    color: 0x12141c,
    transparent: true,
    opacity: BLOB_OPACITY,
    depthWrite: false,
  });

  constructor(scene: Scene) {
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP_PX, SHADOW_MAP_PX);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.5;
    scene.add(this.sun, this.sun.target, this.ambient);
    this.setPart('day');
  }

  /**
   * Adds a lantern post with the billboards it swaps between. Its light hangs `LAMP.height` above the origin of the
   * object the caller adds it to (the post, so the light moves and hides with it).
   */
  addLantern(lit: Object3D | null, unlit: Object3D | null): Lantern {
    const light = new PointLight(LAMP.colour, LAMP.intensity, LAMP.reach, 1);
    light.position.set(0, LAMP.height, 0);
    const lantern = { light, lit, unlit };
    this.lanterns.push(lantern);
    this.showLantern(lantern);
    return lantern;
  }

  /** A blob shadow: a disc of `radius` scene units on the ground, for the caller to place under a billboard. */
  blob(radius: number): Mesh {
    const mesh = new Mesh(this.blobGeometry, this.blobMaterial);
    mesh.scale.set(radius, 1, radius);
    mesh.position.y = 0.5; // just above the ground, which writes no depth (SpriteWorld.groundMesh)
    mesh.renderOrder = -0.5;
    mesh.name = 'blob';
    return mesh;
  }

  /** Lights the scene for a part of the day: the sun and the ambient, and the lamps on or off. */
  setPart(part: DayPart): void {
    this.part = part;
    const l = lightingOf(part);
    this.sun.color.setHex(l.sun.colour);
    this.sun.intensity = l.sun.intensity;
    this.ambient.color.setHex(l.ambient.colour);
    this.ambient.intensity = l.ambient.intensity;
    for (const lantern of this.lanterns) this.showLantern(lantern);
  }

  get dayPart(): DayPart {
    return this.part;
  }

  /**
   * Stands the sun over the ground point `(x, y)` the camera looks at, its shadow camera wide enough to hold a view
   * `halfW` x `halfH` scene units at the pitch, with room for the long shadows of what stands just outside it.
   */
  follow(x: number, y: number, halfW: number, halfH: number): void {
    const d = sunDirection();
    this.sun.target.position.set(x, 0, y);
    this.sun.position.set(x + d.x * SUN_DISTANCE, d.y * SUN_DISTANCE, y + d.z * SUN_DISTANCE);
    const r = Math.hypot(halfW, 2 * halfH) * 1.25;
    const cam = this.sun.shadow.camera;
    if (cam.right !== r) {
      cam.left = -r;
      cam.right = r;
      cam.top = r;
      cam.bottom = -r;
      cam.near = 1;
      cam.far = SUN_DISTANCE * 2;
      cam.updateProjectionMatrix();
    }
  }

  dispose(): void {
    this.blobGeometry.dispose();
    this.blobMaterial.dispose();
    this.sun.shadow.dispose();
  }

  private showLantern(lantern: Lantern): void {
    const on = lightingOf(this.part).lamps;
    lantern.light.visible = on;
    // With one frame only, that frame stays up and only the light changes.
    if (lantern.lit) lantern.lit.visible = on || !lantern.unlit;
    if (lantern.unlit) lantern.unlit.visible = !on || !lantern.lit;
  }
}
