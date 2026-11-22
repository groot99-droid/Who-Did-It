import {
  Color,
  Matrix4,
  Vector2,
  Vector3,
  type Material,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { LANTERN } from './config';

// The lantern the walker carries in the caves. three's unlit material (MeshBasicMaterial, which glTF's
// KHR_materials_unlit loads as) takes no light, so the lantern is added in its shader: the base colour (the colour
// factor times the texture, before the baked light in the vertex colours) times lantern(d), added to the baked light
// in linear light, before tone mapping and fog. Every patched material reads the same three uniforms, so a frame sets
// them once. A patched material is an ordinary material: disposing it (dispose.ts) frees it and its program, and
// this module keeps no reference to any material.

/** lantern(d) without the intensity: 1 / (1 + (d / near)^2) x (1 - smoothstep(0.7 x reach, reach, d)). */
export function lanternShape(d: number, near: number = LANTERN.near, reach: number = LANTERN.reach): number {
  const x = Math.min(1, Math.max(0, (d - 0.7 * reach) / (0.3 * reach)));
  const fade = 1 - x * x * (3 - 2 * x);
  return fade / (1 + (d / near) ** 2);
}

/** The lantern's scene-linear light at `d` metres (the shader's lantern(d)). */
export function lanternFalloff(d: number, intensity: number = LANTERN.intensity): number {
  return intensity * lanternShape(d);
}

/** The flicker's factor at `t` seconds: three slow sines (0.47, 1.13 and 2.07 Hz) whose weights sum to 1, so the
 * light never moves by more than `depth` either way and nothing in it is fast enough to read as a strobe. */
export function flickerAt(t: number, depth: number = LANTERN.flicker): number {
  const tau = 2 * Math.PI;
  const wave =
    0.5 * Math.sin(tau * 0.47 * t) +
    0.3 * Math.sin(tau * 1.13 * t + 1.7) +
    0.2 * Math.sin(tau * 2.07 * t + 4.1);
  return 1 + depth * wave;
}

/** The frequencies in `flickerAt`, Hz (for the test that nothing in it strobes). */
export const FLICKER_HZ = [0.47, 1.13, 2.07] as const;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Whether the walker carries the lantern: in a cave area (the index's kind `cave`, or the area's `wdi_kind: "cave"`)
 * or where the GLB's scene (or the area) says `wdi_lantern: true`. `wdi_lantern: false` on the area or the scene
 * turns it off even in a cave. Off everywhere else: the village, the wild areas and the rooms.
 */
export function lanternWanted(opts: {
  kind?: string | null | undefined;
  sceneExtras?: unknown;
  area?: Object3D | null | undefined;
}): boolean {
  const scene = isObject(opts.sceneExtras) ? opts.sceneExtras : {};
  const area = isObject(opts.area?.userData) ? (opts.area.userData as Record<string, unknown>) : {};
  if (area.wdi_lantern === false || scene.wdi_lantern === false) return false;
  return (
    opts.kind === 'cave' ||
    area.wdi_kind === 'cave' ||
    area.wdi_lantern === true ||
    scene.wdi_lantern === true
  );
}

/** Whether any area of a file can want the lantern (then its materials are patched when it is opened): `areas` are
 * its `Area_*` nodes; a file without any asks its scene and the index's kind alone. */
export function lanternAnywhere(opts: {
  kind?: string | null | undefined;
  sceneExtras?: unknown;
  areas: readonly Object3D[];
}): boolean {
  const { kind, sceneExtras, areas } = opts;
  if (areas.length === 0) return lanternWanted({ kind, sceneExtras });
  return areas.some((area) => lanternWanted({ kind, sceneExtras, area }));
}

/** The uniforms every patched material shares: the lantern's position in view space, its colour times its intensity
 * and flicker (zero when it is off), and `near` and `reach`. */
export const lanternUniforms = {
  wdiLanternPos: { value: new Vector3() },
  wdiLanternColor: { value: new Color(0, 0, 0) },
  wdiLanternRange: { value: new Vector2(LANTERN.near, LANTERN.reach) },
};

const VERTEX_ANCHOR = '#include <project_vertex>';
const ALBEDO_ANCHOR = '#include <color_fragment>';
const ADD_ANCHOR = '#include <opaque_fragment>';

/** The shader with the lantern added, or null when three's basic shader no longer has the anchors this needs (a three
 * update; the material then renders as before). */
export function injectLantern(vertex: string, fragment: string): { vertex: string; fragment: string } | null {
  if (!vertex.includes(VERTEX_ANCHOR) || !fragment.includes(ALBEDO_ANCHOR) || !fragment.includes(ADD_ANCHOR))
    return null;
  const v =
    'varying vec3 vWdiView;\n' +
    vertex.replace(VERTEX_ANCHOR, `${VERTEX_ANCHOR}\n\tvWdiView = mvPosition.xyz;`);
  const f =
    'varying vec3 vWdiView;\nuniform vec3 wdiLanternPos;\nuniform vec3 wdiLanternColor;\nuniform vec2 wdiLanternRange;\n' +
    fragment
      // The base colour: the factor times the texture, before the baked light (the vertex colours) multiplies it.
      .replace(ALBEDO_ANCHOR, `vec3 wdiAlbedo = diffuseColor.rgb;\n\t${ALBEDO_ANCHOR}`)
      .replace(
        ADD_ANCHOR,
        [
          'float wdiD = length( vWdiView - wdiLanternPos );',
          'float wdiK = ( 1.0 - smoothstep( 0.7 * wdiLanternRange.y, wdiLanternRange.y, wdiD ) ) /',
          '\t( 1.0 + ( wdiD * wdiD ) / ( wdiLanternRange.x * wdiLanternRange.x ) );',
          'outgoingLight += wdiAlbedo * wdiLanternColor * wdiK;',
          ADD_ANCHOR,
        ].join('\n\t'),
      );
  return { vertex: v, fragment: f };
}

function compileWithLantern(shader: WebGLProgramParametersWithUniforms): void {
  const out = injectLantern(shader.vertexShader, shader.fragmentShader);
  if (!out) return;
  shader.vertexShader = out.vertex;
  shader.fragmentShader = out.fragment;
  Object.assign(shader.uniforms, lanternUniforms);
}

const LANTERN_KEY = 'wdi-lantern-1';
const lanternKey = () => LANTERN_KEY;

/** Emitters the lantern does not light: the gate lamps' glass and the sky seen through a cave mouth. A material (or
 * its mesh) with `wdi_lantern: false` in its extras is skipped too. */
const NOT_LIT = /(^|_)(lamp_glass|vista_sky)(\.\d+)?$/;

/** Whether `material` takes the lantern: an unlit material that is not an emitter. */
export function takesLantern(material: Material, mesh?: Object3D): boolean {
  if (!(material as MeshBasicMaterial).isMeshBasicMaterial) return false;
  if ((material.userData as Record<string, unknown>).wdi_lantern === false) return false;
  if (mesh && (mesh.userData as Record<string, unknown>).wdi_lantern === false) return false;
  return !NOT_LIT.test(material.name);
}

/** Whether a material has the lantern in its shader. */
export function hasLantern(material: Material): boolean {
  return (material.userData as Record<string, unknown>).wdiLantern === true;
}

/** Adds the lantern to every unlit material under `root` (once each); returns how many were patched. Call it before
 * the world's shaders are compiled. */
export function patchLantern(root: Object3D): number {
  let patched = 0;
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (hasLantern(m) || !takesLantern(m, mesh)) continue;
      m.onBeforeCompile = compileWithLantern;
      m.customProgramCacheKey = lanternKey;
      m.userData.wdiLantern = true;
      m.needsUpdate = true;
      patched++;
    }
  });
  return patched;
}

const ahead = new Vector3();

/**
 * The lantern's state: `wanted` follows the area (lanternWanted), `enabled` the walker's toggle (on at the start, and
 * kept across crossings in the page). `update` once a frame, after the camera has moved, sets the shared uniforms.
 */
export class Lantern {
  enabled = true;
  wanted = false;
  /** Seconds since the start, for the flicker. */
  private clock = 0;
  /** The lantern's world position at the last update. */
  readonly position = new Vector3();
  /** The flicker's factor at the last update. */
  flicker = 1;
  private readonly colour = new Color(LANTERN.colour);

  constructor(readonly uniforms = lanternUniforms) {}

  /** The lantern shows: the area wants it and the walker has it on. */
  get lit(): boolean {
    return this.wanted && this.enabled;
  }

  /** Turns the lantern on or off; returns whether it is on now. */
  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /** Where the lantern is for an eye at `eye` facing `yaw`: `ahead` in front of it on the ground plane and
   * `belowEye` under it. */
  static place(eye: Vector3, yaw: number, out = new Vector3()): Vector3 {
    ahead.set(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(LANTERN.ahead);
    return out
      .copy(eye)
      .add(ahead)
      .setY(eye.y - LANTERN.belowEye);
  }

  /** Moves the lantern with the eye and sets the uniforms: its position in view space (`view` is the camera's
   * matrixWorldInverse) and its colour, zero when it is not lit. */
  update(dt: number, eye: Vector3, yaw: number, view: Matrix4): void {
    this.clock += dt;
    Lantern.place(eye, yaw, this.position);
    this.uniforms.wdiLanternPos.value.copy(this.position).applyMatrix4(view);
    this.flicker = flickerAt(this.clock);
    const c = this.uniforms.wdiLanternColor.value;
    if (this.lit) c.copy(this.colour).multiplyScalar(LANTERN.intensity * this.flicker);
    else c.setRGB(0, 0, 0);
  }
}
