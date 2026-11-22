import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { TINY_INDEX_URL, tinyWorld } from '../test/helpers/tiny-areas';

// A world in many files (docs/walk-areas.md): the contract's test world (test/fixtures/areas/, .gltf files) and the
// two tiny .glb caves of test/helpers/tiny-areas.ts, served at made-up addresses and opened with ?index=.

const AREAS = new URL('../test/fixtures/areas/', import.meta.url);
const AREAS_URL = 'http://localhost:4174/areas/walk-index.json';

interface AreasState {
  ready: boolean;
  error: string | null;
  spawn: string | null;
  mode: string | null;
  areaId: string | null;
  travelling: boolean;
  trip: { portal: string; area?: string | null } | null;
  crossings: number;
  notice: string | null;
  lastCrossing: {
    from: string | null;
    to: string;
    before: { geometries: number; textures: number };
    after: { geometries: number; textures: number };
    freed: { textures: number; bitmaps: number; collider: boolean } | null;
    ms: number;
  } | null;
  memory: { geometries: number; textures: number };
}

const state = (page: Page): Promise<AreasState> =>
  page.evaluate(() => (window as unknown as { __walk: AreasState }).__walk);

async function serve(page: Page): Promise<void> {
  await page.route('**/areas/*', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    route.fulfill({
      body: readFileSync(new URL(name, AREAS)),
      contentType: name.endsWith('.json') ? 'application/json' : 'model/gltf+json',
    });
  });
  const { files } = tinyWorld();
  await page.route('http://walk.test/**', (route) => {
    const body = files.get(route.request().url().split('?')[0]!);
    if (!body) return route.fulfill({ status: 404, body: 'missing' });
    return route.fulfill({
      body,
      contentType: route.request().url().includes('.json') ? 'application/json' : 'model/gltf-binary',
      headers: { 'access-control-allow-origin': '*' },
    });
  });
}

async function open(page: Page, query: Record<string, string>): Promise<AreasState> {
  await serve(page);
  await page.goto(`/Who-Did-It/walk/?${new URLSearchParams({ ...query, debug: '' })}`);
  await expect.poll(async () => (await state(page)).ready, { timeout: 30_000 }).toBe(true);
  await page.locator('#view').focus();
  return state(page);
}

test('opens the index at its start, and at ?spawn= in the file that holds it', async ({ page }) => {
  expect(await open(page, { index: AREAS_URL })).toMatchObject({ areaId: 'village_west', spawn: 'square' });
  await page.goto(
    `/Who-Did-It/walk/?${new URLSearchParams({ index: AREAS_URL, spawn: 'undermere_seam_a_b_b_2', debug: '' })}`,
  );
  await expect.poll(async () => (await state(page)).areaId, { timeout: 30_000 }).toBe('under_b');
  expect(await state(page)).toMatchObject({ spawn: 'undermere_seam_a_b_b_2', error: null });
  // The fade is ink, never black.
  expect(await page.locator('.fade').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(18, 20, 28)',
  );
});

test('walks through the village seam into the other file, freeing the one it left', async ({ page }) => {
  await open(page, { index: AREAS_URL, spawn: 'overworld_seam_west_east_a_2' });
  // The arrival faces west, away from the seam: back east into its row, letting go as the row fires (held on, the
  // walker would walk back through the other file's row, 1.2 m behind its arrival).
  await page.keyboard.down('KeyS');
  await expect
    .poll(async () => (await state(page)).trip?.area, { timeout: 30_000, intervals: [20] })
    .toBe('village_east');
  await page.keyboard.up('KeyS');
  await expect.poll(async () => (await state(page)).crossings, { timeout: 30_000 }).toBe(1);
  await expect.poll(async () => (await state(page)).travelling).toBe(false);
  const s = await state(page);
  expect(s).toMatchObject({ areaId: 'village_east', spawn: 'overworld_seam_west_east_b_2' });
  // Each section holds one 4 x 4 texture: after the crossing the renderer holds as many as before, not one more
  // (renderer.info.memory, read in the page before the crossing and after it).
  console.log(`renderer memory around the crossing: ${JSON.stringify(s.lastCrossing)}`);
  // The page holds one texture of its own besides the area's; the section left is gone, not added to. (Textures are
  // uploaded before the ink lifts; a geometry counts only once drawn, so its count depends on the frame.)
  expect(s.lastCrossing!.after.textures).toBe(s.lastCrossing!.before.textures);
  expect(s.lastCrossing!.freed).toMatchObject({ textures: 1, bitmaps: 1, collider: true });
});

test('the picker crosses to a spawn of another file', async ({ page }) => {
  await open(page, { index: AREAS_URL });
  await page.locator('.picker select').selectOption('undermere_mouth_east');
  await expect.poll(async () => (await state(page)).areaId, { timeout: 30_000 }).toBe('under_a');
  await expect.poll(async () => (await state(page)).travelling).toBe(false);
  const s = await state(page);
  expect(s).toMatchObject({ spawn: 'undermere_mouth_east', crossings: 1 });
  // The village section's texture is freed and the cave holds none: the renderer holds one texture fewer.
  console.log(`renderer memory, village_west to under_a: ${JSON.stringify(s.lastCrossing)}`);
  expect(s.lastCrossing!.after.textures).toBe(s.lastCrossing!.before.textures - 1);
});

test('a seam into a sidle arrival delivers the walker sidling, in the page and by page load', async ({
  page,
}) => {
  await open(page, { index: TINY_INDEX_URL, spawn: 'undermere_seam_xy_a_1' });
  await page.keyboard.down('KeyS');
  await expect
    .poll(async () => (await state(page)).trip?.area, { timeout: 30_000, intervals: [20] })
    .toBe('under_y');
  await page.keyboard.up('KeyS');
  await expect.poll(async () => (await state(page)).areaId, { timeout: 30_000 }).toBe('under_y');
  await expect.poll(async () => (await state(page)).travelling).toBe(false);
  expect(await state(page)).toMatchObject({ spawn: 'undermere_seam_xy_b_1', mode: 'sidle' });

  await page.goto(
    `/Who-Did-It/walk/?${new URLSearchParams({ index: TINY_INDEX_URL, spawn: 'undermere_seam_xy_a_1', cross: 'reload', debug: '' })}`,
  );
  await expect.poll(async () => (await state(page)).ready, { timeout: 30_000 }).toBe(true);
  await page.locator('#view').focus();
  await page.keyboard.down('KeyS');
  await page.waitForURL(/area=under_y/, { timeout: 30_000 });
  await page.keyboard.up('KeyS');
  await expect.poll(async () => (await state(page)).ready, { timeout: 30_000 }).toBe(true);
  expect(await state(page)).toMatchObject({
    areaId: 'under_y',
    spawn: 'undermere_seam_xy_b_1',
    mode: 'sidle',
  });
  expect(new URL(page.url()).searchParams.get('cross')).toBe('reload');
});

test('a cave mouth into a village that is not in the index says so and keeps the walker', async ({
  page,
}) => {
  await open(page, { index: TINY_INDEX_URL });
  await page.keyboard.down('KeyS');
  await expect
    .poll(async () => (await state(page)).notice, { timeout: 30_000 })
    .toBe('The village is not built yet');
  await page.keyboard.up('KeyS');
  expect(await state(page)).toMatchObject({ areaId: 'under_x', crossings: 0 });
});

test('the lantern toggle survives a crossing by page load (?cross=reload), kept in the tab', async ({
  page,
}) => {
  type Lantern = { wanted: boolean; enabled: boolean; lit: boolean; patched: number };
  const lantern = (): Promise<Lantern> =>
    page.evaluate(() => (window as unknown as { __walk: { lantern: Lantern } }).__walk.lantern);
  await serve(page);
  await page.goto(
    `/Who-Did-It/walk/?${new URLSearchParams({ index: TINY_INDEX_URL, spawn: 'undermere_seam_xy_a_1', cross: 'reload', debug: '' })}`,
  );
  await expect.poll(async () => (await state(page)).ready, { timeout: 30_000 }).toBe(true);
  await page.locator('#view').focus();
  expect(await lantern()).toMatchObject({ wanted: true, enabled: true, lit: true });
  // Off with L; then through the seam, where the page loads again at the arrival.
  await page.keyboard.press('KeyL');
  await expect.poll(async () => (await lantern()).enabled, { timeout: 10_000 }).toBe(false);
  expect(await lantern()).toMatchObject({ wanted: true, enabled: false, lit: false });
  await page.keyboard.down('KeyS');
  await page.waitForURL(/area=under_y/, { timeout: 30_000 });
  await page.keyboard.up('KeyS');
  await expect.poll(async () => (await state(page)).ready, { timeout: 30_000 }).toBe(true);
  await page.locator('#view').focus();
  expect(await state(page)).toMatchObject({ areaId: 'under_y' });
  // The new page starts with the lantern as the walker left it: off.
  expect(await lantern()).toMatchObject({ wanted: true, enabled: false, lit: false });
  await page.keyboard.press('KeyL');
  await expect.poll(async () => (await lantern()).enabled, { timeout: 10_000 }).toBe(true);
  expect(await lantern()).toMatchObject({ wanted: true, enabled: true, lit: true });
});
