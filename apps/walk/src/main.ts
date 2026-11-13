import './style.css';
import {
  ACESFilmicToneMapping,
  Clock,
  Color,
  DirectionalLight,
  HemisphereLight,
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
import { Controller, wishFromInput } from './physics/controller';
import { pickSpawn, type Spawn } from './spawn';
import { buildWorld, type World } from './world';

const SKY = new Color('#9fb3c8');
const STICK_RADIUS = 60;
const params = new URLSearchParams(location.search);
const debugOn = params.has('debug');

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;

const scene = new Scene();
scene.background = SKY.clone();
const camera = new PerspectiveCamera(RENDER.fov, 1, RENDER.near, RENDER.far);
const fallbackLights = [new HemisphereLight('#dfe8ff', '#4a4034', 1.6), new DirectionalLight('#fff4e0', 1.4)];
fallbackLights[1]!.position.set(30, 60, 20);

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
}

function enter(gltf: GLTF): void {
  disposeWorld();
  const root = gltf.scene;
  world = buildWorld(root, root.userData as Record<string, unknown>);
  scene.add(root);
  scene.fog = world.fog;
  scene.background = world.fog ? world.fog.color.clone() : SKY.clone();
  if (!world.hasLights) scene.add(...fallbackLights);
  controller = new Controller(world.collider);
  goTo(pickSpawn(world.spawns, params.get('spawn')));
  loadError = null;
  hud.ready(
    world.spawns.map((s) => s.id),
    spawn?.id ?? null,
  );
}

function fail(err: unknown): void {
  loadError = err instanceof Error ? err.message : String(err);
  hud.error(loadError);
}

hud.onSpawn = (id) => goTo(world?.spawns.find((s) => s.id === id) ?? null);

const source = glbFromQuery(location.search);
if (source) {
  hud.progress({ fraction: 0, loaded: 0, label: 'Downloading' });
  loadUrl(loader, source, (p) => hud.progress(p)).then(enter, fail);
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
  if (file) loadFile(loader, file, (p) => hud.progress(p)).then(enter, fail);
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
  if (controller) {
    const fell = controller.update(dt, wishFromInput(frame.forward, frame.strafe, yaw, frame.run));
    if (fell) goTo(spawn);
    eye.copy(controller.position).y += WALK.eyeHeight;
    camera.position.copy(eye);
  }
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
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
        ? `collision: ${world.collisionSource}${world.collisionSource === 'HM_Collision' ? '' : ' (no HM_Collision)'}`
        : '',
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
