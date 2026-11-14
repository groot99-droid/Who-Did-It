import {
  BackSide,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  Object3D,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import final from '../../../tools/blender/meshy_looks/final.json';

// The viewer's defaults come from the Blender look the stills are rendered with (tools/blender/meshy_looks/final.json),
// so the browser and Blender read one file. Colours there are scene-linear; azimuths are Blender's world frame
// (0 = east = +X, 90 = north = +Y), which glTF turns into three's (x, z, -y).

type Rgb = readonly [number, number, number] | number[];
const rgb = (c: Rgb) => new Color().setRGB(c[0]!, c[1]!, c[2]!);

/** A direction from an azimuth and an elevation in degrees, in three's frame. */
export function lookDirection(azimuthDeg: number, elevationDeg: number): Vector3 {
  const a = (azimuthDeg * Math.PI) / 180;
  const e = (elevationDeg * Math.PI) / 180;
  return new Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), -Math.cos(e) * Math.sin(a));
}

/** Blender's view exposure is in stops; three's toneMappingExposure is the multiplier (1.25 stops is 2.38). */
export const DEFAULT_EXPOSURE = 2 ** final.color.exposure;

const EXPOSURE_KEYS = ['wdi_exposure', 'tone_mapping_exposure', 'toneMappingExposure', 'exposure'];

/** toneMappingExposure from the extras of an `Area_*` object (the area at the origin first), else the scene's. */
export function exposureFromScene(root: Object3D): number | null {
  const holders: Object3D[] = [];
  root.traverse((o) => {
    if (o.name.startsWith('Area_')) holders.push(o);
  });
  holders.sort((a, b) => a.position.lengthSq() - b.position.lengthSq());
  for (const o of [...holders, root]) {
    for (const key of EXPOSURE_KEYS) {
      const v = (o.userData as Record<string, unknown>)[key];
      if (typeof v === 'number' && v > 0) return v;
    }
  }
  return null;
}

/** The look's fog: its density, faded into the sky's horizon colour. `fog.color` in the look is the scattering albedo
 * of Blender's volume, not what distant things fade to, so it is not used as the colour here. */
export function defaultFog(): FogExp2 {
  return new FogExp2(rgb(final.sky.horizon), final.fog.density);
}

/** The moon (a sun lamp in Blender, W/m2, which three's directional intensity matches) and the share of the sky that
 * lights the scene. A uniform sky of radiance L gives irradiance pi * L, hence the pi. */
export function defaultLights(): Object3D[] {
  const moon = new DirectionalLight(rgb(final.moon.color), final.moon.energy);
  moon.position.copy(lookDirection(final.moon.azimuth, final.moon.elevation)).multiplyScalar(100);
  const skyAverage = rgb(final.sky.horizon).lerp(rgb(final.sky.zenith), 0.5);
  const sky = new HemisphereLight(skyAverage, rgb(final.sky.ground), Math.PI * final.sky.light);
  return [moon, sky];
}

/** The sky the camera sees, as in Blender's HM_Sky world: horizon to zenith, the glow band, the ground below.
 * It follows the camera and ignores fog; stars and the moon disc are left out. */
export function makeSky(radius: number): Mesh {
  const s = final.sky;
  const glow = lookDirection(s.glow_azimuth, 0);
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: rgb(s.zenith) },
      horizon: { value: rgb(s.horizon) },
      glow: { value: rgb(s.glow) },
      ground: { value: rgb(s.ground) },
      glowDir: { value: glow },
      glowCos: { value: Math.cos((s.glow_width * Math.PI) / 180) },
      glowHeight: { value: s.glow_height },
      horizonHeight: { value: s.horizon_height },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w; // on the far plane, behind everything
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith, horizon, glow, ground, glowDir;
      uniform float glowCos, glowHeight, horizonHeight;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(horizon, zenith, smoothstep(0.0, horizonHeight, d.y));
        float g = smoothstep(glowCos, 1.0, dot(d, glowDir)) * (1.0 - smoothstep(0.0, glowHeight, d.y));
        col = mix(col, glow, g);
        col = mix(col, ground, smoothstep(0.0, 0.06, -d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new Mesh(new SphereGeometry(radius, 32, 16), material);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  sky.name = 'WDI_Sky';
  return sky;
}
