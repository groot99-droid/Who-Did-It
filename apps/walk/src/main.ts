import './style.css';
import {
  AgXToneMapping,
  Clock,
  Color,
  Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import {
  areaUrl,
  crossingAddress,
  parseIndex,
  pickerSpawns,
  routePortal,
  routeToSpawn,
  startOf,
  worldFromQuery,
  type IndexArea,
  type Route,
  type WalkIndex,
} from './areas';
import { CROSSING, DEFAULT_GLB_URL, DEFAULT_INDEX_URL, LOOK, RENDER } from './config';
import { disposeWorld, memoryOf, resourcesOf, type DisposeReport } from './dispose';
import { Hud } from './hud';
import { Input } from './input';
import { fetchBytes, loadFile, loadUrl, makeLoader, parseBytes, type Progress } from './load';
import { DEFAULT_EXPOSURE, defaultFog, defaultLights, exposureFromScene, makeSky } from './look';
import { Controller, wishFromInput } from './physics/controller';
import { PortalTrigger, resolvePortal, type Portal } from './portals';
import { AreaSwap, SwapError } from './session';
import { pickSpawn, plainWords, type Spawn } from './spawn';
import { MODE_HINT, ViewTurn } from './traverse';
import { areaLook, buildWorld, nearestArea, showNearestArea, type World } from './world';

const STICK_RADIUS = 60;
const params = new URLSearchParams(location.search);
const debugOn = params.has('debug');
/** How a crossing between area files is made: in the page (Option 1, the default), or by loading the page again at
 * the arrival spawn (Option 0, `?cross=reload`). */
const crossByReload = params.get('cross') === 'reload';

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
renderer.outputColorSpace = SRGBColorSpace;
// AgX as in Blender (which adds its Medium High Contrast look on top); shadows stay off (the lanterns hold their lights).
renderer.toneMapping = AgXToneMapping;
// Ink, never black, before a world shows and behind a crossing.
renderer.setClearColor(new Color(CROSSING.ink));
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
let area: Object3D | null | undefined;
let indoor = false;
let trigger: PortalTrigger | null = null;
let travelling = false;
let trip: { portal: string; spawn: string | null; fallback: boolean; area?: string | null } | null = null;
/** Turns and holds the view while sidling (traverse.ts). */
const viewTurn = new ViewTurn();
const INDOOR_BACKGROUND = new Color(CROSSING.ink);
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** With an index (docs/walk-areas.md): the index, its absolute address, and the one area file open in the page. */
let index: WalkIndex | null = null;
let indexUrl = '';
const swap = new AreaSwap({
  fetch: (url, bytes, onProgress) => fetchBytes(url, bytes, onProgress),
  parse: (bytes, url) => parseBytes(loader, bytes, url),
});
/** Crossings made in this page, and the renderer's memory around the last one (for ?debug and the e2e spec). */
let crossings = 0;
let lastCrossing: {
  from: string | null;
  to: string;
  before: { geometries: number; textures: number };
  after: { geometries: number; textures: number };
  freed: DisposeReport | null;
  ms: number;
} | null = null;

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/** Takes the world out of the page and drops every reference to it; the caller frees it. */
function releaseWorld(w: World): void {
  scene.remove(w.root);
  scene.remove(...fallbackLights);
  if (world === w) {
    world = null;
    controller = null;
    trigger = null;
    spawn = null;
    area = undefined;
  }
  // The render lists still point at the old meshes until the next frame; let them go now.
  renderer.renderLists.dispose();
  hud.setMode(null);
}

/** Single-file mode: frees the open world completely (textures included) before another file is opened. */
function disposeSingle(): void {
  if (!world) return;
  const w = world;
  releaseWorld(w);
  disposeWorld(w);
}

function goTo(target: Spawn | null): void {
  if (!world || !controller) return;
  spawn = target;
  if (target) {
    // A spawn's wdi_mode starts the walker in that mode (a seam inside a crawl delivers it crawling), when the
    // spawn stands in a zone of that kind; any spawn in a crawl zone starts crawling.
    const asked = world.spawnModes.get(target.id);
    const started = controller.place(target.position, { mode: asked, yaw: target.yaw });
    if (asked && started !== asked)
      console.warn(
        `Spawn_${target.id} asks for ${asked} but starts in ${started}: it stands in no ${asked} zone, or in a crawl zone.`,
      );
    yaw = target.yaw;
  } else {
    // No spawn: the origin, dropped from above the world onto whatever is under it.
    const top = world.collider.bounds.max.y + 1;
    const ground = world.collider.groundBelow(0, top, 0, top - world.collider.bounds.min.y + 1);
    controller.place(new Vector3(0, ground ?? 0, 0));
    yaw = 0;
  }
  // Arriving sideways faces the wall at once.
  yaw = viewTurn.snap(yaw, controller.viewHold);
  pitch = 0;
  trigger?.disarm();
  hud.setSpawn(spawn?.id ?? null);
  updateArea(true);
}

/** Shows only the area the player is in and, when that area changed, applies its look: indoors there is no moon,
 * sky light or sky; fog and exposure come from the area's extras before the world's. */
function updateArea(force = false): void {
  if (!world || !controller) return;
  const { x, z } = controller.position;
  const next = nearestArea(world.areas, x, z);
  showNearestArea(world.areas, x, z);
  if (next === area && !force) return;
  area = next;
  const look = areaLook(next);
  indoor = look.indoor;
  scene.fog = look.fog ?? (indoor ? null : (world.fog ?? defaultFog()));
  scene.background = indoor ? INDOOR_BACKGROUND : world.fog ? world.fog.color.clone() : null;
  sky.visible = !indoor && !world.fog;
  for (const light of fallbackLights) light.visible = !indoor;
  renderer.toneMappingExposure =
    askedExposure > 0 ? askedExposure : (look.exposure ?? exposureFromScene(world.root) ?? DEFAULT_EXPOSURE);
}

type FileRoute = { kind: 'file'; found: { spawn: Spawn; fallback: boolean } | null };

/** Where a portal leads: with an index, the exact spawn id across every area (areas.ts, routePortal); in single-file
 * mode, `Spawn_<to>_<toSpawn>` in this file, else `Spawn_<toSpawn>`, as always. */
function portalRoute(portal: Portal): Route | FileRoute {
  if (index) return routePortal(index, swap.current?.area.id ?? null, portal);
  return { kind: 'file', found: world ? resolvePortal(portal, world.spawns) : null };
}

/** Takes a portal: a short fade to its target in this file, a crossing to another area's file, or a notice that its
 * target is not built yet (the walker stays). */
function travel(portal: Portal): void {
  if (!world) return;
  const route = portalRoute(portal);
  if (route.kind === 'file') {
    const found = route.found;
    trip = { portal: portal.id, spawn: found?.spawn.id ?? null, fallback: found?.fallback ?? false };
    if (!found) {
      // A door whose room is not in this GLB yet (a later export adds it): say so and stay.
      hud.say(`${plainWords(portal.to)} is not built yet`);
      return;
    }
    travelling = true;
    void hud.fade(() => goTo(found.spawn)).finally(() => (travelling = false));
    return;
  }
  trip = {
    portal: portal.id,
    spawn: route.kind === 'missing' ? null : route.spawn,
    fallback: false,
    area: route.kind === 'missing' ? null : route.area.id,
  };
  follow(route);
}

/** Goes where a route leads, with an index: a fade within the open file, or a crossing into another. */
function follow(route: Route): void {
  if (route.kind === 'missing') {
    hud.say(route.words);
    return;
  }
  if (route.kind === 'here') {
    const target = world?.spawns.find((s) => s.id === route.spawn) ?? null;
    if (!target) {
      // The index lists a spawn this file does not hold: an index older than its files.
      hud.say(`${route.spawn} is not in ${route.area.file}; rebuild the index`);
      return;
    }
    travelling = true;
    void hud.fade(() => goTo(target)).finally(() => (travelling = false));
    return;
  }
  void cross(route.area, route.spawn);
}

/**
 * A crossing into another area's file: the ink fades in over 0.2 s, and the loading hint shows once the crossing has
 * taken 0.4 s. With `?cross=reload` (Option 0) the page then loads itself again at the arrival spawn, the ink left up
 * until it is gone. Otherwise (Option 1) the area is swapped inside the page (AreaSwap: the next file's bytes, then
 * the open area freed, then the next one built), its shaders and textures prepared, and the ink lifted.
 */
async function cross(next: IndexArea, spawnId: string): Promise<void> {
  if (travelling) return;
  travelling = true;
  const started = performance.now();
  const hint = setTimeout(() => hud.loading(`Opening ${next.name}`), CROSSING.hintAfterMs);
  await hud.cover(CROSSING.fadeMs);
  if (crossByReload) {
    // Replace, not assign: no history entry to walk back through, and no old page kept in the back/forward cache.
    location.replace(crossingAddress(location.href, next.id, spawnId));
    return;
  }
  const from = swap.current;
  const before = memoryInfo();
  const pose = controller ? { at: controller.position.clone(), yaw } : null;
  try {
    await openArea(next, spawnId, (p) => hud.loading(`Opening ${next.name} · ${progressWords(p)}`));
    crossings++;
    lastCrossing = {
      from: from?.area.id ?? null,
      to: next.id,
      before,
      after: memoryInfo(),
      freed: swap.lastFreed,
      ms: performance.now() - started,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof SwapError && err.stage === 'parse' && from) {
      // The area that was left is gone already: open it again and put the walker back where they stood.
      try {
        await openArea(from.area, null);
        if (controller && pose) {
          controller.place(pose.at, { yaw: pose.yaw });
          yaw = pose.yaw;
        }
      } catch (again) {
        fail(again);
      }
    }
    hud.say(`Could not open ${next.name}: ${message}`, 5000);
  } finally {
    clearTimeout(hint);
    hud.loading(null);
    await hud.uncover(CROSSING.fadeMs);
    travelling = false;
  }
}

function progressWords(p: Progress): string {
  return p.fraction === null ? p.label : `${p.label} ${Math.round(p.fraction * 100)}%`;
}

function memoryInfo(): { geometries: number; textures: number } {
  return { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
}

/** Opens an area of the index (the first one, or the next at a crossing) and starts at `spawnId` in it. */
async function openArea(
  next: IndexArea,
  spawnId: string | null,
  onProgress?: (p: Progress) => void,
): Promise<void> {
  const url = areaUrl(indexUrl, next);
  const t0 = performance.now();
  const opened = await swap.open(next, url, { onProgress, release: releaseWorld });
  collisionMs = performance.now() - t0;
  await place(opened.world, spawnId);
}

/** Puts a built world into the page and the walker at `spawnId` in it (else `?spawn=`, square or the first). */
async function place(w: World, spawnId: string | null): Promise<void> {
  world = w;
  scene.add(w.root);
  // Fog from the GLB's extras shows as a flat background; without it the look's fog and sky apply (updateArea).
  if (!w.hasSun) scene.add(...fallbackLights);
  controller = new Controller(w.collider, {}, w.zones);
  trigger = new PortalTrigger(w.portals);
  area = undefined;
  const exact = spawnId ? (w.spawns.find((s) => s.id === spawnId) ?? null) : null;
  goTo(exact ?? pickSpawn(w.spawns, index ? spawnId : params.get('spawn')));
  camera.position.copy(controller.position).y += controller.eyeHeight;
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  await renderer.compileAsync(scene, camera);
  // Upload the textures before the ink lifts, or the first frames after a crossing stall while they upload.
  for (const t of resourcesOf(w.root).textures) renderer.initTexture(t);
  loadError = null;
  hud.ready(index ? pickerSpawns(index) : w.spawns, spawn?.id ?? null);
}

async function enter(gltf: GLTF): Promise<void> {
  disposeSingle();
  const root = gltf.scene;
  hud.progress({ fraction: null, loaded: 0, label: 'Building collision' });
  await nextFrame();
  await nextFrame();
  const t0 = performance.now();
  const built = buildWorld(root, root.userData as Record<string, unknown>);
  collisionMs = performance.now() - t0;
  hud.progress({ fraction: null, loaded: 0, label: 'Preparing shaders' });
  await place(built, null);
}

/** Opens a world from its index: the area that holds `?spawn=` (else `?area=`, else the index's start). */
async function enterIndex(url: string): Promise<void> {
  hud.progress({ fraction: null, loaded: 0, label: 'Reading the world index' });
  indexUrl = new URL(url, location.href).href;
  // A page opened by a crossing (Option 0) starts under the ink, so the crossing does not flash.
  const arrived = params.has('area');
  if (arrived) void hud.cover(0);
  let raw: unknown;
  try {
    const res = await fetch(indexUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.json();
  } catch (err) {
    throw new Error(`Could not load ${url}: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }
  const parsed = parseIndex(raw);
  if (!parsed.ok) throw new Error(`Could not use ${url}: ${parsed.reason}`);
  index = parsed.index;
  const start = startOf(index, { spawn: params.get('spawn'), area: params.get('area') });
  await openArea(start.area, start.spawn, (p) => hud.progress(p));
  if (arrived) await hud.uncover(CROSSING.fadeMs);
}

function fail(err: unknown): void {
  loadError = err instanceof Error ? err.message : String(err);
  hud.error(loadError);
  void hud.uncover(0);
}

hud.onSpawn = (id) => {
  if (index) {
    if (!travelling) follow(routeToSpawn(index, swap.current?.area.id ?? null, id));
    return;
  }
  goTo(world?.spawns.find((s) => s.id === id) ?? null);
};
hud.onUse = () => input.requestUse();

const source = worldFromQuery(location.search, { index: DEFAULT_INDEX_URL, glb: DEFAULT_GLB_URL });
if (source?.kind === 'index') {
  enterIndex(source.url).catch(fail);
} else if (source?.kind === 'glb') {
  hud.progress({ fraction: 0, loaded: 0, label: 'Downloading' });
  loadUrl(loader, source.url, (p) => hud.progress(p))
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
  if (!file) return;
  // A dropped file is single-file mode: an open index world is closed first.
  if (index) {
    swap.close(releaseWorld);
    index = null;
  }
  loadFile(loader, file, (p) => hud.progress(p))
    .then(enter)
    .catch(fail);
});

/** The words of the door prompt near a portal. */
function doorLabel(near: Portal): string {
  const route = portalRoute(near);
  if (route.kind === 'file') return plainWords(near.to) + (route.found ? '' : ' (not built yet)');
  if (route.kind === 'missing') return `${route.words.replace(/ is not built yet$/, '')} (not built yet)`;
  return route.kind === 'cross' ? route.area.name : plainWords(near.to);
}

const clock = new Clock();
let fps = 0;
const eye = new Vector3();

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  fps = fps === 0 ? 1 / Math.max(dt, 1e-3) : fps * 0.95 + 0.05 / Math.max(dt, 1e-3);
  const frame = input.poll(dt);
  yaw -= frame.yaw;
  pitch = Math.max(-LOOK.maxPitch, Math.min(LOOK.maxPitch, pitch - frame.pitch));
  // Sidling, the view turns to face the wall and stays within the hold's angle of it.
  if (controller) yaw = viewTurn.apply(yaw, controller.viewHold, dt);
  if (controller && world && (areaClock += dt) > 0.5) {
    areaClock = 0;
    updateArea();
  }
  if (controller) {
    // Standing still through a portal's fade.
    const wish = travelling
      ? { x: 0, z: 0, run: false }
      : wishFromInput(frame.forward, frame.strafe, yaw, frame.run);
    const fell = controller.update(dt, wish);
    if (fell) goTo(spawn);
    eye.copy(controller.position).y += controller.eyeHeight;
    camera.position.copy(eye);
    hud.setMode(controller.mode === 'walk' ? null : MODE_HINT[controller.mode]);
    if (trigger && !travelling) {
      const portal = trigger.update(controller.position, frame.use);
      if (portal) travel(portal);
      const near = trigger.nearest(controller.position, trigger.useRadius);
      hud.setDoor(near && !travelling ? doorLabel(near) : null, input.touchSeen);
    }
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
      controller && world
        ? `mode ${controller.mode}${controller.zone ? ` (Trav_${controller.zone.id})` : ''}` +
          ` · eye ${controller.eyeHeight.toFixed(2)} m · ${world.zones.length} zones`
        : '',
      world
        ? `collision: ${world.collisionSource}${world.collisionSource === 'HM_Collision' ? '' : ' (no HM_Collision)'}` +
          ` · ${(world.collider.geometry.index!.count / 3000).toFixed(0)}k tris in ${collisionMs.toFixed(0)} ms`
        : '',
      `exposure ${renderer.toneMappingExposure.toFixed(2)} · area ${area?.name ?? '-'}${indoor ? ' (indoor)' : ''}`,
      trip
        ? `portal ${trip.portal} → ${trip.spawn ? `Spawn_${trip.spawn}` : 'no spawn'}` +
          (trip.fallback ? ' (fallback: no Spawn_<to>_<toSpawn>)' : '') +
          (trip.area ? ` in ${trip.area}` : '')
        : '',
      index
        ? `file ${swap.current?.area.file ?? '-'} · ${crossings} crossings (${crossByReload ? 'reload' : 'in page'})` +
          ` · GPU ${renderer.info.memory.geometries} geometries, ${renderer.info.memory.textures} textures`
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
      mode: controller?.mode ?? null,
      zone: controller?.zone?.id ?? null,
      eye: controller?.eyeHeight ?? null,
      zones: world?.zones.map((z) => z.id) ?? [],
      area: area?.name ?? null,
      indoor,
      exposure: renderer.toneMappingExposure,
      trip,
      // With an index: the open area, the crossings, the notice on screen and the memory around the last crossing.
      areaId: swap.current?.area.id ?? null,
      travelling,
      crossings,
      lastCrossing,
      notice: hud.noticeText,
      memory: memoryInfo(),
      held: world ? memoryOf(world.root) : null,
    }),
  });
}
