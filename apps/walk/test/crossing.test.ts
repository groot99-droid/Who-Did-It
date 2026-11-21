import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
  type BufferGeometry,
  type Material,
} from 'three';
import { describe, expect, it } from 'vitest';
import {
  crossingAddress,
  parseIndex,
  routePortal,
  startOf,
  areaUrl,
  areaById,
  type WalkIndex,
} from '../src/areas';
import { disposeTree, memoryOf, resourcesOf, texturesOf } from '../src/dispose';
import { Controller, wishFromInput } from '../src/physics/controller';
import { PortalTrigger } from '../src/portals';
import { AreaSwap, SwapError, type OpenArea } from '../src/session';
import type { World } from '../src/world';
import { bitmaps, folderFiles, memoryIo } from './helpers/node-gltf';
import { TINY_INDEX_URL, tinyWorld } from './helpers/tiny-areas';

// Crossings between area files (src/session.ts, Option 1 of docs/walk-areas.md section 7, and Option 0's address) on
// the two tiny .glb caves of helpers/tiny-areas.ts, each with one 4 x 4 texture, and on the contract's test world.

function tinyIndex(): WalkIndex {
  const parsed = parseIndex(tinyWorld().index);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.index;
}

/** Every dispose event of every geometry, material and texture under a world, counted as they fire. */
function watchDisposal(world: World): {
  geometries: Set<BufferGeometry>;
  materials: Set<Material>;
  textures: Set<Texture>;
} {
  const seen = {
    geometries: new Set<BufferGeometry>(),
    materials: new Set<Material>(),
    textures: new Set<Texture>(),
  };
  const r = resourcesOf(world.root);
  for (const g of r.geometries) g.addEventListener('dispose', () => seen.geometries.add(g));
  for (const m of r.materials) m.addEventListener('dispose', () => seen.materials.add(m));
  for (const t of r.textures) t.addEventListener('dispose', () => seen.textures.add(t));
  return seen;
}

/** The geometries (the collider's included) and textures of every world added, each until its dispose event: what
 * three's renderer.info.memory counts once they are uploaded. */
function liveLedger() {
  const alive = new Map<object, World>();
  return {
    add(world: World): void {
      const r = resourcesOf(world.root);
      for (const res of [...r.geometries, ...r.textures, world.collider.geometry]) {
        alive.set(res, world);
        res.addEventListener('dispose', () => alive.delete(res));
      }
    },
    count(): { textures: number; geometries: number } {
      const keys = [...alive.keys()];
      return {
        textures: keys.filter((k) => (k as Texture).isTexture).length,
        geometries: keys.filter((k) => !(k as Texture).isTexture).length,
      };
    },
    holds(world: World): boolean {
      return [...alive.values()].includes(world);
    },
  };
}

/** A walker at a spawn of an open area, as main.ts's goTo puts it there: the spawn's wdi_mode carried. */
function arrive(open: OpenArea, id: string): Controller {
  const s = open.world.spawns.find((x) => x.id === id);
  if (!s) throw new Error(`no Spawn_${id} in ${open.area.file}`);
  const c = new Controller(open.world.collider, {}, open.world.zones);
  c.place(s.position, { mode: open.world.spawnModes.get(id), yaw: s.yaw });
  return c;
}

describe('the tiny world', () => {
  it('loads both .glb files with a texture each, as GLTFLoader gives them to the page', async () => {
    const { files } = tinyWorld();
    const index = tinyIndex();
    const swap = new AreaSwap(memoryIo(files));
    const x = await swap.open(
      areaById(index, 'under_x')!,
      areaUrl(TINY_INDEX_URL, areaById(index, 'under_x')!),
    );
    expect(x.world.collisionSource).toBe('HM_Collision');
    expect(x.world.spawns.map((s) => s.id)).toEqual(['undermere_mouth_x', 'undermere_seam_xy_a_1']);
    expect(x.world.portals.map((p) => p.id)).toEqual(['umx_out', 'seam_xy_a_1']);
    const textures = [...resourcesOf(x.world.root).textures];
    expect(textures).toHaveLength(1);
    expect(textures[0]!.image).toMatchObject({ width: 4, height: 4 });
  });
});

describe('a crossing in the page (Option 1)', () => {
  it('walks into the seam, frees the old area completely before the new one is parsed, and carries the mode', async () => {
    const { files } = tinyWorld();
    const index = tinyIndex();
    const io = memoryIo(files);
    const swap = new AreaSwap(io);
    const xArea = areaById(index, 'under_x')!;
    const live = liveLedger();
    const x = await swap.open(xArea, areaUrl(TINY_INDEX_URL, xArea));
    live.add(x.world);
    const xWorld = x.world;
    const freedSeen = watchDisposal(xWorld);
    const liveBefore = live.count();
    const xTexture = [...resourcesOf(xWorld.root).textures][0]!;
    const before = memoryOf(xWorld.root);

    // From the seam arrival of under_x, walk east into the row: the trigger fires the seam's portal point.
    const c = arrive(x, 'undermere_seam_xy_a_1');
    expect(c.mode).toBe('walk');
    const trigger = new PortalTrigger(xWorld.portals);
    trigger.disarm();
    let fired = null;
    for (let f = 0; f < 600 && !fired; f++) {
      c.update(1 / 60, wishFromInput(1, 0, -Math.PI / 2, false));
      fired = trigger.update(c.position, false);
    }
    expect(fired?.id).toBe('seam_xy_a_1');
    const route = routePortal(index, swap.current!.area.id, fired!);
    expect(route).toMatchObject({ kind: 'cross', spawn: 'undermere_seam_xy_b_1', area: { id: 'under_y' } });
    if (route.kind !== 'cross') return;

    // Never two areas' textures at once: when the next file is parsed, the old texture is already freed.
    let freedWhenParsing: boolean | null = null;
    io.parsing = () => (freedWhenParsing = freedSeen.textures.has(xTexture));
    const closedBefore = bitmaps.closed;
    let released: World | null = null;
    const y = await swap.open(route.area, areaUrl(TINY_INDEX_URL, route.area), {
      release: (w) => (released = w),
    });
    live.add(y.world);
    expect(freedWhenParsing).toBe(true);
    expect(released).toBe(xWorld);

    // Everything of under_x was freed: each geometry (the floor and the collision box), each material (the floor's,
    // and the default one GLTFLoader gives the collision mesh), the texture and its bitmap, and the collider's merged
    // geometry.
    const r = resourcesOf(xWorld.root);
    expect([...freedSeen.geometries].length).toBe(r.geometries.size);
    expect([...freedSeen.materials].length).toBe(r.materials.size);
    expect([...freedSeen.textures]).toEqual([xTexture]);
    expect(bitmaps.closed - closedBefore).toBe(1);
    expect(xTexture.source.data).toBeNull();
    expect(swap.lastFreed).toEqual({
      geometries: 2,
      materials: 2,
      textures: 1,
      bitmaps: 1,
      instanced: 0,
      collider: true,
    });

    // The memory held, measured on the scene graphs before and after the crossing (the page shows the renderer's
    // own counts, renderer.info.memory, in its ?debug readout): only under_y's is left.
    const after = memoryOf(y.world.root);
    console.log(
      `memory before the crossing (under_x): ${JSON.stringify(before)}, alive ${JSON.stringify(liveBefore)};` +
        ` after (under_y): ${JSON.stringify(after)}, alive ${JSON.stringify(live.count())};` +
        ` freed: ${JSON.stringify(swap.lastFreed)}`,
    );
    expect(before).toEqual({ textures: 1, textureBytes: 85, geometries: 2, geometryBytes: 912 });
    expect(after).toEqual({ textures: 1, textureBytes: 85, geometries: 2, geometryBytes: 912 });
    // And as the renderer counts them (renderer.info.memory: a resource counts until its dispose event): what is
    // alive across both files, before the crossing and after it.
    expect(liveBefore).toEqual({ textures: 1, geometries: 3 });
    expect(live.count()).toEqual({ textures: 1, geometries: 3 });
    expect(live.holds(xWorld)).toBe(false);
    expect(swap.current?.area.id).toBe('under_y');

    // The arrival's wdi_mode sidle starts the walker sidling in the next file: the mode is carried.
    expect(arrive(y, route.spawn).mode).toBe('sidle');
    expect(swap.swaps).toBe(2);
  });

  it('a failed fetch leaves the open area as it was; a failed parse comes after it was freed', async () => {
    const { files } = tinyWorld();
    const index = tinyIndex();
    const xArea = areaById(index, 'under_x')!;
    const yArea = areaById(index, 'under_y')!;
    const broken = new Map(files);
    broken.delete(new URL('walk-under_y.glb', TINY_INDEX_URL).href);
    const swap = new AreaSwap(memoryIo(broken));
    const x = await swap.open(xArea, areaUrl(TINY_INDEX_URL, xArea));
    const seen = watchDisposal(x.world);
    const err = await swap.open(yArea, areaUrl(TINY_INDEX_URL, yArea)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SwapError);
    expect((err as SwapError).stage).toBe('fetch');
    expect((err as SwapError).message).toMatch(
      /^Could not load http:\/\/walk\.test\/caves\/walk-under_y\.glb\?v=/,
    );
    expect(swap.current).toBe(x);
    expect(seen.textures.size).toBe(0);

    broken.set(new URL('walk-under_y.glb', TINY_INDEX_URL).href, Buffer.from('not a glTF'));
    const bad = await swap.open(yArea, areaUrl(TINY_INDEX_URL, yArea)).catch((e: unknown) => e);
    expect((bad as SwapError).stage).toBe('parse');
    expect(swap.current).toBeNull();
    expect(seen.textures.size).toBe(1);
  });

  it('crosses the contract world from square through the seam, into the caves by the mouth, and frees each file', async () => {
    const base = 'http://walk.test/areas/walk-index.json';
    const dir = new URL('./fixtures/areas/', import.meta.url);
    const files = folderFiles(
      dir,
      [
        'walk-village_west.gltf',
        'walk-village_east.gltf',
        'walk-under_a.gltf',
        'walk-under_b.gltf',
        'walk-room_shop.gltf',
      ],
      base,
    );
    const { readFileSync } = await import('node:fs');
    const parsed = parseIndex(JSON.parse(readFileSync(new URL('walk-index.json', dir), 'utf8')));
    if (!parsed.ok) throw new Error(parsed.reason);
    const index = parsed.index;
    const swap = new AreaSwap(memoryIo(files));
    const start = startOf(index);
    let open = await swap.open(start.area, areaUrl(base, start.area));
    const westTextures = resourcesOf(open.world.root).textures.size;
    expect(westTextures).toBe(1);

    // Case 2: from square, walking east fires seam_west_east_a_2 at x = -1.44; the walker lands 1.65 m beyond the
    // line facing on east.
    let c = arrive(open, start.spawn!);
    let trigger = new PortalTrigger(open.world.portals);
    let fired = null;
    for (let f = 0; f < 60 * 60 && !fired; f++) {
      c.update(1 / 60, wishFromInput(1, 0, -Math.PI / 2, false));
      fired = trigger.update(c.position, false);
    }
    expect(fired?.id).toBe('seam_west_east_a_2');
    expect(c.position.x).toBeCloseTo(-1.44, 1);
    let route = routePortal(index, open.area.id, fired!);
    expect(route).toMatchObject({ kind: 'cross', area: { id: 'village_east' } });
    if (route.kind !== 'cross') return;
    open = await swap.open(route.area, areaUrl(base, route.area));
    expect(swap.lastFreed).toMatchObject({ textures: 1, bitmaps: 1, collider: true });
    const arrival = route.spawn;
    c = arrive(open, arrival);
    expect(c.position.toArray().map((v) => +v.toFixed(2))).toEqual([1.65, 0, 0]);
    expect(open.world.spawns.find((s) => s.id === arrival)!.yaw).toBeCloseTo(-Math.PI / 2);

    // Walking on east fires nothing; the cave mouth, used from its arrival, opens under_a, which holds no texture.
    trigger = new PortalTrigger(open.world.portals);
    trigger.disarm();
    for (let f = 0; f < 120; f++) {
      c.update(1 / 60, wishFromInput(1, 0, -Math.PI / 2, false));
      expect(trigger.update(c.position, false)).toBeNull();
    }
    c = arrive(open, 'overworld_mouth_east');
    const mouth = trigger.update(c.position, true);
    expect(mouth?.id).toBe('umeast_in');
    route = routePortal(index, open.area.id, mouth!);
    expect(route).toMatchObject({ kind: 'cross', spawn: 'undermere_mouth_east', area: { id: 'under_a' } });
    if (route.kind !== 'cross') return;
    open = await swap.open(route.area, areaUrl(base, route.area));
    expect(swap.lastFreed).toMatchObject({ textures: 1, bitmaps: 1 });
    expect(memoryOf(open.world.root).textures).toBe(0);
    expect(arrive(open, route.spawn).position.y).toBeCloseTo(-10, 3);
  });
});

describe('a crossing by page load (Option 0)', () => {
  it("the new page's address opens the arrival's file and the spawn's wdi_mode starts its mode", async () => {
    const { files } = tinyWorld();
    const index = tinyIndex();
    const route = routePortal(index, 'under_x', { to: 'undermere', toSpawn: 'seam_xy_b_1' });
    if (route.kind !== 'cross') throw new Error('not a crossing');
    const next = new URL(
      crossingAddress(
        `http://walk.test/walk/?index=${encodeURIComponent(TINY_INDEX_URL)}&debug`,
        route.area.id,
        route.spawn,
      ),
    );
    // The new page: it reads the index again and starts where the address says.
    const start = startOf(index, {
      spawn: next.searchParams.get('spawn'),
      area: next.searchParams.get('area'),
    });
    expect(start).toMatchObject({ spawn: 'undermere_seam_xy_b_1', area: { id: 'under_y' } });
    expect(next.searchParams.get('index')).toBe(TINY_INDEX_URL);
    const swap = new AreaSwap(memoryIo(files));
    const open = await swap.open(start.area, areaUrl(TINY_INDEX_URL, start.area));
    expect(arrive(open, start.spawn!).mode).toBe('sidle');
  });
});

describe('a gate into an area that is not in the index', () => {
  it('says so and keeps the walker where they are: nothing is fetched and the open area stays', async () => {
    const { files } = tinyWorld();
    const index = tinyIndex();
    const io = memoryIo(files);
    const swap = new AreaSwap(io);
    const xArea = areaById(index, 'under_x')!;
    const x = await swap.open(xArea, areaUrl(TINY_INDEX_URL, xArea));
    const c = arrive(x, 'undermere_mouth_x');
    const trigger = new PortalTrigger(x.world.portals);
    trigger.disarm();
    let fired = null;
    // Walk back west out of the cave to its mouth, Portal_um.x_out, 1.5 m behind the arrival.
    for (let f = 0; f < 600 && !fired; f++) {
      c.update(1 / 60, wishFromInput(-1, 0, -Math.PI / 2, false));
      fired = trigger.update(c.position, false);
    }
    expect(fired).toMatchObject({ id: 'umx_out', to: 'overworld', toSpawn: 'mouth_x', kind: 'cave_mouth' });
    const route = routePortal(index, swap.current!.area.id, fired!);
    expect(route).toEqual({ kind: 'missing', words: 'The village is not built yet' });
    // main.ts says the words and does nothing else (follow): the walker stays, nothing more is fetched.
    expect(io.fetched).toHaveLength(1);
    expect(swap.current).toBe(x);
    // Walking on does not fire it again until the walker has stepped out of its radius.
    for (let f = 0; f < 30; f++) {
      c.update(1 / 60, wishFromInput(-1, 0, -Math.PI / 2, false));
      expect(trigger.update(c.position, false)).toBeNull();
    }
  });
});

describe('disposeTree', () => {
  it('frees a texture held only by a material once, and closes its bitmap', () => {
    const tex = new Texture({
      width: 2,
      height: 2,
      close: () => (closed += 1),
    } as unknown as HTMLImageElement);
    let closed = 0;
    let disposed = 0;
    tex.addEventListener('dispose', () => disposed++);
    const root = new Group();
    const material = new MeshStandardMaterial({ map: tex, emissiveMap: tex });
    root.add(new Mesh(new BoxGeometry(), material), new Mesh(new BoxGeometry(), material));
    expect(texturesOf(material)).toEqual([tex]);
    expect(disposeTree(root)).toEqual({
      geometries: 2,
      materials: 1,
      textures: 1,
      bitmaps: 1,
      instanced: 0,
      collider: false,
    });
    expect(disposed).toBe(1);
    expect(closed).toBe(1);
  });
});
