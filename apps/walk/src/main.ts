import './style.css';
import {
  AgXToneMapping,
  Clock,
  Material,
  Mesh,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { LOOK, RENDER, WALK } from './config';
import { Hud } from './hud';
import { Input } from './input';
import { glbFromQuery, loadFile, loadUrl, makeLoader } from './load';
import { DEFAULT_EXPOSURE, defaultFog, defaultLights, exposureFromScene, makeSky } from './look';
import { Controller, wishFromInput } from './physics/controller';
import { pickSpawn, type Spawn } from './spawn';
import { buildWorld, showNearestArea, type World } from './world';

const STICK_RADIUS = 60;
const params = new URLSearchParams(location.search);
const debugOn = params.has('debug');

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
renderer.outputColorSpace = SRGBColorSpace;
// AgX as in Blender (which adds its Medium High Contrast look on top); shadows stay off (the lanterns hold their lights).
renderer.toneMapping = AgXToneMapping;
const askedExposure = Number(params.get('exposure'));

const scene = new Scene();
const camera = new PerspectiveCamera(RENDER.fov, 1, RENDER.near, RENDER.far);
const fallbackLights = defaultLights();
const sky = makeSky(RENDER.far * 0.9);
scene.add(sky);

const hud = new Hud(document.querySelector<HTMLElement>('#hud')!, debugOn);
const input = new Input(canvas, STICK_RADIUS);
input.onStick = (origin, offset) => hud.setStick(origin, offset, STICK_RADIUS);
const loader = makeLoader(renderer);

let world: World | null = null;
let controller: Controller | null = null;
let spawn: Spawn | null = null;
let yaw = 0;
let pitch = 0;
let loadError: string | null = null;
let collisionMs = 0;
let areaClock = 0;
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function disposeWorld(): void {
  if (!world) return;
  scene.remove(world.root);
  world.root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) m.dispose();
  });
  world.collider.geometry.dispose();
  scene.remove(...fallbackLights);
  world = null;
  controller = null;
}

function goTo(target: Spawn | null): void {
  if (!world || !controller) return;
  spawn = target;
  if (target) {
    controller.place(target.position);
    yaw = target.yaw;
  } else {
    // No spawn: the origin, dropped from above the world onto whatever is under it.
    const top = world.collider.bounds.max.y + 1;
    const ground = world.collider.groundBelow(0, top, 0, top - world.collider.bounds.min.y + 1);
    controller.place(new Vector3(0, ground ?? 0, 0));
    yaw = 0;
  }
  pitch = 0;
  showNearestArea(world.areas, controller.position.x, controller.position.z);
}

async function enter(gltf: GLTF): Promise<void> {
  disposeWorld();
  const root = gltf.scene;
  hud.progress({ fraction: null, loaded: 0, label: 'Building collision' });
  await nextFrame();
  await nextFrame();
  const t0 = performance.now();
  world = buildWorld(root, root.userData as Record<string, unknown>);
  collisionMs = performance.now() - t0;
  scene.add(root);
  // Fog from the GLB's extras shows as a flat background; without it the look's fog and sky apply.
  scene.fog = world.fog ?? defaultFog();
  scene.background = world.fog ? world.fog.color.clone() : null;
  sky.visible = !world.fog;
  if (!world.hasSun) scene.add(...fallbackLights);
  renderer.toneMappingExposure =
    askedExposure > 0 ? askedExposure : (exposureFromScene(root) ?? DEFAULT_EXPOSURE);
  controller = new Controller(world.collider);
  goTo(pickSpawn(world.spawns, params.get('spawn')));
  hud.progress({ fraction: null, loaded: 0, label: 'Preparing shaders' });
  camera.position.copy(controller.position).y += WALK.eyeHeight;
  await renderer.compileAsync(scene, camera);
  loadError = null;
  hud.ready(world.spawns, spawn?.id ?? null);
}

function fail(err: unknown): void {
  loadError = err instanceof Error ? err.message : String(err);
  hud.error(loadError);
}

hud.onSpawn = (id) => goTo(world?.spawns.find((s) => s.id === id) ?? null);

const source = glbFromQuery(location.search);
if (source) {
  hud.progress({ fraction: 0, loaded: 0, label: 'Downloading' });
  loadUrl(loader, source, (p) => hud.progress(p))
    .then(enter)
    .catch(fail);
} else {
  hud.waiting('No world file is hosted yet. Drop a .glb on the page, or open this page with ?glb=<url>.');
}

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  hud.showDrop(true);
});
window.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null) hud.showDrop(false);
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  hud.showDrop(false);
  const file = e.dataTransfer?.files[0];
  if (file)
    loadFile(loader, file, (p) => hud.progress(p))
      .then(enter)
      .catch(fail);
});

const clock = new Clock();
let fps = 0;
const eye = new Vector3();

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  fps = fps === 0 ? 1 / Math.max(dt, 1e-3) : fps * 0.95 + 0.05 / Math.max(dt, 1e-3);
  const frame = input.poll(dt);
  yaw -= frame.yaw;
  pitch = Math.max(-LOOK.maxPitch, Math.min(LOOK.maxPitch, pitch - frame.pitch));
  if (controller && world && (areaClock += dt) > 0.5) {
    areaClock = 0;
    showNearestArea(world.areas, controller.position.x, controller.position.z);
  }
  if (controller) {
    const fell = controller.update(dt, wishFromInput(frame.forward, frame.strafe, yaw, frame.run));
    if (fell) goTo(spawn);
    eye.copy(controller.position).y += WALK.eyeHeight;
    camera.position.copy(eye);
  }
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  sky.position.copy(camera.position);
  const padOn = navigator.getGamepads?.().some((p) => p?.connected) ?? false;
  hud.setHint(padOn ? 'pad' : input.touchSeen ? 'touch' : 'desktop', input.locked);
  if (debugOn) {
    const p = controller?.position;
    hud.setDebug([
      `${fps.toFixed(0)} fps · ${renderer.info.render.triangles} tris · ${renderer.info.render.calls} calls`,
      p
        ? `x ${p.x.toFixed(2)} y ${p.y.toFixed(2)} z ${p.z.toFixed(2)} ${controller?.onGround ? 'ground' : 'air'}`
        : '',
      world
        ? `collision: ${world.collisionSource}${world.collisionSource === 'HM_Collision' ? '' : ' (no HM_Collision)'}` +
          ` · ${(world.collider.geometry.index!.count / 3000).toFixed(0)}k tris in ${collisionMs.toFixed(0)} ms`
        : '',
      `exposure ${renderer.toneMappingExposure.toFixed(2)} · area ${world?.areas.find((a) => a.visible)?.name ?? '-'}`,
    ]);
  }
  renderer.render(scene, camera);
});

/** Read-only state for the Playwright spec, only with ?debug. */
if (debugOn) {
  Object.defineProperty(window, '__walk', {
    get: () => ({
      ready: controller !== null,
      error: loadError,
      spawns: world?.spawns.map((s) => s.id) ?? [],
      spawn: spawn?.id ?? null,
      collisionSource: world?.collisionSource ?? null,
      position: controller ? controller.position.toArray() : null,
      onGround: controller?.onGround ?? false,
      yaw,
    }),
  });
}
