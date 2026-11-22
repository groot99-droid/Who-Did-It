import {
  Color,
  Matrix4,
  Vector2,
  Vector3,
  Vector4,
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
  /** The mist: its colour as the display shows it (sRGB 0 to 1). */
  wdiMistColor: { value: hexDisplay(LANTERN.mist.colour) },
  /** The mist: per metre the density and the wet gain, the most it mixes in, and the lantern-free floor (unused: 0). */
  wdiMist: { value: new Vector4(LANTERN.mist.density, LANTERN.mist.wetGain, LANTERN.mist.max, 0) },
};

/** A hex colour as sRGB display values 0 to 1. */
export function hexDisplay(hex: string): Vector3 {
  return inkDisplay(hex);
}

/** The mist an area asks for (its `wdi_mist` extras: `colour` hex, `density`, `wet_gain`, `max`); anything it leaves out is
 * the config's. Called when the walker changes area. Returns the uniform values it set. */
export function setMist(
  extras: unknown,
  uniforms: Pick<typeof lanternUniforms, 'wdiMistColor' | 'wdiMist'> = lanternUniforms,
) {
  const m = isObject(extras) ? extras : {};
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  uniforms.wdiMistColor.value.copy(hexDisplay(typeof m.colour === 'string' ? m.colour : LANTERN.mist.colour));
  uniforms.wdiMist.value.set(
    Math.max(0, num(m.density, LANTERN.mist.density)),
    Math.max(0, num(m.wet_gain, LANTERN.mist.wetGain)),
    Math.min(1, Math.max(0, num(m.max, LANTERN.mist.max))),
    0,
  );
  return { colour: uniforms.wdiMistColor.value.clone(), mist: uniforms.wdiMist.value.clone() };
}

const VERTEX_ANCHOR = '#include <project_vertex>';
const MAP_ANCHOR = '#include <map_fragment>';
const MAP_PARS_ANCHOR = '#include <map_pars_fragment>';
const ALBEDO_ANCHOR = '#include <color_fragment>';
const AO_ANCHOR = '#include <aomap_fragment>';
const ADD_ANCHOR = '#include <opaque_fragment>';
const END_ANCHOR = '#include <dithering_fragment>';

const glsl = (n: number): string => (Number.isInteger(n) ? `${n}.0` : `${n}`);

/** The stochastic sampler (hex tiling, after Mikkelsen's "Practical real-time hex tiling"): the triangle grid over the
 * texture coordinates, three random rotated and offset copies of the texture per triangle, blended by weights raised
 * to a power (so a tile's centre is the texture itself and the blend is narrow), each tile a little brighter or darker.
 * It samples with the coordinates' own derivatives, so the mip level is that of the plain lookup. */
const STOCHASTIC = `
#ifdef USE_MAP
vec2 wdiHash22( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.xx + p3.yz ) * p3.zy );
}
vec4 wdiTile( vec2 uv, vec2 dx, vec2 dy, vec2 cell ) {
	vec2 h = wdiHash22( cell );
	vec2 h2 = wdiHash22( cell + 17.0 );
	float a = 6.2831853 * h.x;
	float c = cos( a );
	float s = sin( a );
	mat2 r = mat2( c, s, -s, c );
	vec4 t = textureGrad( map, r * uv + h.yx * 7.0, r * dx, r * dy );
	t.rgb *= 1.0 + ${glsl(LANTERN.stochastic.jitter)} * ( 2.0 * h2.x - 1.0 );
	return t;
}
vec4 wdiStochastic( vec2 uv ) {
	if ( length( vWdiView ) > ${glsl(LANTERN.stochastic.far)} ) return texture2D( map, uv );
	vec2 dx = dFdx( uv );
	vec2 dy = dFdy( uv );
	vec2 st = uv * ( 3.4641016 * ${glsl(LANTERN.stochastic.cell)} );
	vec2 sk = mat2( 1.0, 0.0, -0.57735027, 1.15470054 ) * st;
	vec2 base = floor( sk );
	vec3 t = vec3( fract( sk ), 0.0 );
	t.z = 1.0 - t.x - t.y;
	vec3 w;
	vec2 v1;
	vec2 v2;
	vec2 v3;
	if ( t.z > 0.0 ) {
		w = vec3( t.z, t.y, t.x );
		v1 = base;
		v2 = base + vec2( 0.0, 1.0 );
		v3 = base + vec2( 1.0, 0.0 );
	} else {
		w = vec3( -t.z, 1.0 - t.y, 1.0 - t.x );
		v1 = base + vec2( 1.0, 1.0 );
		v2 = base + vec2( 1.0, 0.0 );
		v3 = base + vec2( 0.0, 1.0 );
	}
	vec4 c1 = wdiTile( uv, dx, dy, v1 );
	vec4 c2 = wdiTile( uv, dx, dy, v2 );
	vec4 c3 = wdiTile( uv, dx, dy, v3 );
	w = pow( w, vec3( ${glsl(LANTERN.stochastic.sharp)} ) );
	w /= w.x + w.y + w.z;
	return c1 * w.x + c2 * w.y + c3 * w.z;
}
#endif
`;

/** The shader with the lantern added, or null when three's basic shader no longer has the anchors this needs (a three
 * update; the material then renders as before). */
export function injectLantern(vertex: string, fragment: string): { vertex: string; fragment: string } | null {
  if (!vertex.includes(VERTEX_ANCHOR) || !fragment.includes(ALBEDO_ANCHOR) || !fragment.includes(ADD_ANCHOR))
    return null;
  const v =
    'varying vec3 vWdiView;\nvarying vec3 vWdiNormal;\nvarying float vWdiOccl;\nvarying vec3 vWdiTint;\nvarying float vWdiWet;\n' +
    'attribute float _occl;\nattribute vec3 _tint;\nattribute float _wet;\n' +
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
        // The rock's graded albedo (`_TINT`, linear; zero where a mesh has none) and its wetness (`_WET`, 0 to 1).
        'vWdiTint = _tint;',
        'vWdiWet = _wet;',
      ].join('\n\t'),
    );
  const f =
    'varying vec3 vWdiView;\nvarying vec3 vWdiNormal;\nvarying float vWdiOccl;\nvarying vec3 vWdiTint;\nvarying float vWdiWet;\n' +
    'uniform vec3 wdiLanternPos;\nuniform vec3 wdiLanternColor;\n' +
    'uniform vec2 wdiLanternRange;\nuniform vec2 wdiLanternShade;\nuniform vec3 wdiInk;\n' +
    'uniform vec3 wdiMistColor;\nuniform vec4 wdiMist;\n' +
    fragment
      // The stochastic sampler goes after the map's own declarations (it reads `map`).
      .replace(
        MAP_PARS_ANCHOR,
        `${MAP_PARS_ANCHOR}
${STOCHASTIC}`,
      )
      // The last thing a pixel gets: no darker than the ink, whatever the bake, the filter and the encoding did. A pixel
      // under the ink's luminance (a little over it, so that the 8-bit rounding never takes it under) gets the missing
      // luminance in the ink's colour, so a dark warm pixel stays warm and nothing is lifted that is not dark.
      .replace(
        END_ANCHOR,
        [
          END_ANCHOR,
          // The mist: a faint cool haze by the distance from the eye, thicker where the surface is wet.
          'float wdiMk = wdiMist.x + wdiMist.y * vWdiWet;',
          'gl_FragColor.rgb = mix( gl_FragColor.rgb, wdiMistColor, wdiMist.z * ( 1.0 - exp( -wdiMk * length( vWdiView ) ) ) );',
          'float wdiLum = dot( gl_FragColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );',
          'float wdiInkLum = dot( wdiInk, vec3( 0.2126, 0.7152, 0.0722 ) );',
          'gl_FragColor.rgb += wdiInk * ( max( wdiInkLum + 0.6 / 255.0 - wdiLum, 0.0 ) / wdiInkLum );',
          // The ink's own blue must not bring a teal or a lilac back: the two guards run after it (each only ever
          // raises a channel, so the pixel stays over the ink).
          // Never lilac or magenta: where green is the least channel it is lifted to the lesser of red and
          // blue (a cave's warm light leaves green between them; only a purple cast has it below both).
          'gl_FragColor.g = max( gl_FragColor.g, min( gl_FragColor.r, gl_FragColor.b ) );',
          // Never teal on rock (teal is a light's colour here): where green and blue stand together well over red (the
          // hue between 160 and 200 degrees), red is lifted to 0.9 of the higher of the two, which leaves a cold grey.
          'float wdiHi = max( gl_FragColor.g, gl_FragColor.b );',
          'float wdiLo = min( gl_FragColor.g, gl_FragColor.b );',
          'if ( wdiLo - gl_FragColor.r >= 0.6 * ( wdiHi - gl_FragColor.r ) && wdiHi - gl_FragColor.r > 0.12 * wdiHi )',
          '\tgl_FragColor.r = 0.9 * wdiHi;',
        ].join('\n\t'),
      )
      // The baked light where it is dim: less of its colour, and a little cold (see LANTERN.fill).
      .replace(
        AO_ANCHOR,
        [
          '{',
          '\tfloat wdiBl = dot( reflectedLight.indirectDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) );',
          `\tfloat wdiDim = 1.0 - smoothstep( 0.0, ${glsl(LANTERN.fill.knee)}, wdiBl );`,
          `\tvec3 wdiGrey = vec3( wdiBl ) + mix( 1.0, ${glsl(LANTERN.fill.chroma)}, wdiDim ) * ( reflectedLight.indirectDiffuse - vec3( wdiBl ) );`,
          `\treflectedLight.indirectDiffuse = mix( wdiGrey, wdiBl * vec3( 0.80, 0.95, 1.20 ), ${glsl(LANTERN.fill.cool)} * wdiDim );`,
          `\treflectedLight.indirectDiffuse += ${glsl(LANTERN.fill.lift)} * wdiDim * wdiDim * vec3( 0.80, 0.95, 1.20 );`,
          '}',
          AO_ANCHOR,
        ].join('\n\t'),
      )
      // The scan, sampled stochastically (no square of it repeats).
      .replace(
        MAP_ANCHOR,
        [
          '#ifdef USE_MAP',
          '\tvec4 sampledDiffuseColor = wdiStochastic( vMapUv );',
          '\tdiffuseColor *= sampledDiffuseColor;',
          '#endif',
        ].join('\n\t'),
      )
      // The base colour: the factor times the texture, before the baked light (the lightmap, or the vertex colours)
      // multiplies it; under the lantern it is the rock's own colour, the file's `_TINT` over the reference.
      .replace(
        ALBEDO_ANCHOR,
        [
          'vec3 wdiAlbedo = diffuseColor.rgb;',
          'float wdiHeight = dot( wdiAlbedo, vec3( 0.2126, 0.7152, 0.0722 ) );',
          'if ( vWdiTint.r + vWdiTint.g + vWdiTint.b > 0.0001 ) {',
          `\tvec3 wdiTr = vWdiTint / ${glsl(LANTERN.tintRef)};`,
          '\tfloat wdiTl = dot( wdiTr, vec3( 0.2126, 0.7152, 0.0722 ) );',
          `\twdiTr = max( vec3( wdiTl ) + ${glsl(LANTERN.tintChroma)} * ( wdiTr - vec3( wdiTl ) ), vec3( 0.0 ) );`,
          `\twdiTr = pow( wdiTr, vec3( ${glsl(LANTERN.tintGamma)} ) );`,
          `\twdiTr *= max( 1.0, ${glsl(LANTERN.tintFloor)} / max( dot( wdiTr, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.001 ) );`,
          '\twdiAlbedo *= wdiTr;',
          '}',
          `\t${ALBEDO_ANCHOR}`,
        ].join('\n'),
      )
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
          'vec3 wdiLdir = wdiToLantern / max( wdiD, 1e-4 );',
          'float wdiNdotL = clamp( dot( wdiN, wdiLdir ), 0.0, 1.0 );',
          'wdiK *= mix( 1.0 - wdiLanternShade.x, 1.0, wdiNdotL );',
          // The baked occlusion: the open share, 1 minus the vertex attribute.
          'wdiK *= mix( 1.0, 1.0 - clamp( vWdiOccl, 0.0, 1.0 ), wdiLanternShade.y );',
          'outgoingLight += wdiAlbedo * wdiLanternColor * wdiK;',
          // The wet sheen: Blinn-Phong from the lantern at the eye, the normal bent by the texture's own luminance, only
          // where the vertices are wet (`_WET`); the dry rock takes nothing, and the cost is one branch.
          'if ( vWdiWet > 0.01 ) {',
          '\tvec3 wdiDpx = dFdx( vWdiView );',
          '\tvec3 wdiDpy = dFdy( vWdiView );',
          `\tfloat wdiDhx = ${glsl(LANTERN.gloss.bump)} * dFdx( wdiHeight );`,
          `\tfloat wdiDhy = ${glsl(LANTERN.gloss.bump)} * dFdy( wdiHeight );`,
          '\tvec3 wdiR1 = cross( wdiDpy, wdiN );',
          '\tvec3 wdiR2 = cross( wdiN, wdiDpx );',
          '\tfloat wdiDet = dot( wdiDpx, wdiR1 );',
          '\tvec3 wdiNb = normalize( abs( wdiDet ) * wdiN - sign( wdiDet ) * ( wdiDhx * wdiR1 + wdiDhy * wdiR2 ) );',
          '\tvec3 wdiH = normalize( wdiLdir - normalize( vWdiView ) );',
          `\tfloat wdiSpec = pow( max( dot( wdiNb, wdiH ), 0.0 ), ${glsl(LANTERN.gloss.shininess)} );`,
          `\toutgoingLight += wdiLanternColor * ( ${glsl(LANTERN.gloss.strength)} * wdiSpec * clamp( vWdiWet, 0.0, 1.0 ) * wdiK * pow( clamp( wdiHeight / 0.2, 0.15, 1.6 ), 2.0 ) );`,
          '}',
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

const LANTERN_KEY = 'wdi-lantern-3';
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
  private readonly colour = new Color(LANTERN.colour).lerp(new Color(1, 1, 1), LANTERN.whiten);

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
