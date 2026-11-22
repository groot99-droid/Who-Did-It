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
// factor times the texture, before the baked light in the lightmap or the vertex colours) times lantern(d) times a
// surface-angle term (the weak N.L from the lantern's position; the normal is the GLB's, or the screen's derivative
// where a file has none) times the baked ambient occlusion (the file's `_OCCL` vertex attribute, 1 minus the open
// share), added to the baked light in linear light, before tone mapping and fog. Every patched material reads the same three uniforms, so a frame sets
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

/** The ink (config LANTERN.ink) as sRGB display values 0 to 1: the colour a pixel that would be darker is lifted by. */
export function inkDisplay(hex: string = LANTERN.ink): Vector3 {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return new Vector3((n >> 16) & 255, (n >> 8) & 255, n & 255).divideScalar(255);
}

/** The uniforms every patched material shares: the lantern's position in view space, its colour times its intensity
 * and flicker (zero when it is off), `near` and `reach`, and the weights of the angle and occlusion terms. */
export const lanternUniforms = {
  wdiLanternPos: { value: new Vector3() },
  wdiLanternColor: { value: new Color(0, 0, 0) },
  wdiLanternRange: { value: new Vector2(LANTERN.near, LANTERN.reach) },
  /** The surface-angle term's weight and the occlusion's (config LANTERN.form and aoWeight). */
  wdiLanternShade: { value: new Vector2(LANTERN.form, LANTERN.aoWeight) },
  /** The ink, as the display shows it (sRGB 0 to 1): no pixel of a cave is drawn darker (in luminance). */
  wdiInk: { value: inkDisplay() },
};

const VERTEX_ANCHOR = '#include <project_vertex>';
const ALBEDO_ANCHOR = '#include <color_fragment>';
const ADD_ANCHOR = '#include <opaque_fragment>';
const END_ANCHOR = '#include <dithering_fragment>';

/** The shader with the lantern added, or null when three's basic shader no longer has the anchors this needs (a three
 * update; the material then renders as before). */
export function injectLantern(vertex: string, fragment: string): { vertex: string; fragment: string } | null {
  if (!vertex.includes(VERTEX_ANCHOR) || !fragment.includes(ALBEDO_ANCHOR) || !fragment.includes(ADD_ANCHOR))
    return null;
  const v =
    'varying vec3 vWdiView;\nvarying vec3 vWdiNormal;\nvarying float vWdiOccl;\nattribute float _occl;\n' +
    vertex.replace(
      VERTEX_ANCHOR,
      [
        VERTEX_ANCHOR,
        'vWdiView = mvPosition.xyz;',
        // The GLB's normal in view space (zero where the file has none: the fragment then uses the screen's own).
        'vec3 wdiNormal = normal;',
        '#ifdef USE_INSTANCING',
        '\twdiNormal = mat3( instanceMatrix ) * wdiNormal;',
        '#endif',
        'vWdiNormal = normalMatrix * wdiNormal;',
        // The baked occlusion (1 - the open share) of the file's `_OCCL` attribute; 0 where a mesh has none.
        'vWdiOccl = _occl;',
      ].join('\n\t'),
    );
  const f =
    'varying vec3 vWdiView;\nvarying vec3 vWdiNormal;\nvarying float vWdiOccl;\nuniform vec3 wdiLanternPos;\nuniform vec3 wdiLanternColor;\n' +
    'uniform vec2 wdiLanternRange;\nuniform vec2 wdiLanternShade;\nuniform vec3 wdiInk;\n' +
    fragment
      // The last thing a pixel gets: no darker than the ink, whatever the bake, the filter and the encoding did. A pixel
      // under the ink's luminance (a little over it, so that the 8-bit rounding never takes it under) gets the missing
      // luminance in the ink's colour, so a dark warm pixel stays warm and nothing is lifted that is not dark.
      .replace(
        END_ANCHOR,
        [
          END_ANCHOR,
          // Never lilac or magenta: where green is the least channel it is lifted to the lesser of red and
          // blue (a cave's warm light leaves green between them; only a purple cast has it below both).
          'gl_FragColor.g = max( gl_FragColor.g, min( gl_FragColor.r, gl_FragColor.b ) );',
          // Never teal on rock (teal is a light's colour here): where green and blue stand together well over red (the
          // hue between 160 and 200 degrees), red is lifted to 0.9 of the higher of the two, which leaves a cold grey.
          'float wdiHi = max( gl_FragColor.g, gl_FragColor.b );',
          'float wdiLo = min( gl_FragColor.g, gl_FragColor.b );',
          'if ( wdiLo - gl_FragColor.r >= 0.67 * ( wdiHi - gl_FragColor.r ) && wdiHi - gl_FragColor.r > 0.12 * wdiHi )',
          '\tgl_FragColor.r = 0.9 * wdiHi;',
          'float wdiLum = dot( gl_FragColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );',
          'float wdiInkLum = dot( wdiInk, vec3( 0.2126, 0.7152, 0.0722 ) );',
          'gl_FragColor.rgb += wdiInk * ( max( wdiInkLum + 0.6 / 255.0 - wdiLum, 0.0 ) / wdiInkLum );',
        ].join('\n\t'),
      )
      // The base colour: the factor times the texture, before the baked light (the lightmap, or the vertex colours)
      // multiplies it.
      .replace(ALBEDO_ANCHOR, `vec3 wdiAlbedo = diffuseColor.rgb;\n\t${ALBEDO_ANCHOR}`)
      .replace(
        ADD_ANCHOR,
        [
          'vec3 wdiToLantern = wdiLanternPos - vWdiView;',
          'float wdiD = length( wdiToLantern );',
          'float wdiK = ( 1.0 - smoothstep( 0.7 * wdiLanternRange.y, wdiLanternRange.y, wdiD ) ) /',
          '\t( 1.0 + ( wdiD * wdiD ) / ( wdiLanternRange.x * wdiLanternRange.x ) );',
          // The surface-angle term: the normal turned to face the eye, N.L to the lantern, weakly.
          'vec3 wdiNd = cross( dFdx( vWdiView ), dFdy( vWdiView ) );',
          'float wdiNl = length( vWdiNormal );',
          'vec3 wdiN = wdiNl > 0.5 ? vWdiNormal / wdiNl : normalize( wdiNd + vec3( 1e-12 ) );',
          'wdiN = faceforward( wdiN, vWdiView, wdiN );',
          'float wdiNdotL = clamp( dot( wdiN, wdiToLantern / max( wdiD, 1e-4 ) ), 0.0, 1.0 );',
          'wdiK *= mix( 1.0 - wdiLanternShade.x, 1.0, wdiNdotL );',
          // The baked occlusion: the open share, 1 minus the vertex attribute.
          'wdiK *= mix( 1.0, 1.0 - clamp( vWdiOccl, 0.0, 1.0 ), wdiLanternShade.y );',
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

const LANTERN_KEY = 'wdi-lantern-2';
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

/** The key the walker's toggle is kept under in the tab's sessionStorage (`'on'` or `'off'`). */
export const LANTERN_STORE_KEY = 'wdi-walk-lantern';

/** The part of Storage the toggle uses. */
export type LanternStore = Pick<Storage, 'getItem' | 'setItem'>;

/** The uniforms a Lantern sets; the shared `lanternUniforms` in the page, stand-ins in a test. */
export interface LanternUniforms {
  wdiLanternPos: { value: Vector3 };
  wdiLanternColor: { value: Color };
}

/** The tab's sessionStorage, or null where the browser has none or blocks it. */
export function sessionStore(): LanternStore | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

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

  constructor(
    readonly uniforms: LanternUniforms = lanternUniforms,
    private readonly store: LanternStore | null = null,
  ) {
    // The walker's choice outlives a page load (a crossing by `?cross=reload` loads the page again).
    try {
      if (store?.getItem(LANTERN_STORE_KEY) === 'off') this.enabled = false;
    } catch {
      /* storage can be blocked: the lantern then starts on */
    }
  }

  /** The lantern shows: the area wants it and the walker has it on. */
  get lit(): boolean {
    return this.wanted && this.enabled;
  }

  /** Turns the lantern on or off; returns whether it is on now. */
  toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      this.store?.setItem(LANTERN_STORE_KEY, this.enabled ? 'on' : 'off');
    } catch {
      /* storage can be blocked: the choice then holds for this page only */
    }
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
