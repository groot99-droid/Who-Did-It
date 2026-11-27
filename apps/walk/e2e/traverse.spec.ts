import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// The traversal fixture (scripts/make-fixture.mjs): from room A through the 1.0 m crawl tunnel, the 0.45 m sidle
// fissure and up the 4 m climb face onto the ledge, then back off its edge and down the face.
const TRAVERSE = readFileSync(fileURLToPath(new URL('../test/fixtures/walk-traverse.gltf', import.meta.url)));
const TRAVERSE_URL = 'http://localhost:4174/fixture/walk-traverse.gltf';

interface TraverseState {
  ready: boolean;
  error: string | null;
  spawn: string | null;
  position: [number, number, number] | null;
  onGround: boolean;
  yaw: number;
  mode: 'walk' | 'crawl' | 'sidle' | 'climb' | null;
  zone: string | null;
  eye: number | null;
  zones: string[];
}

const state = (page: Page): Promise<TraverseState> =>
  page.evaluate(() => (window as unknown as { __walk: TraverseState }).__walk);

async function open(page: Page, spawn: string): Promise<{ state: TraverseState; warnings: string[] }> {
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning') warnings.push(m.text());
  });
  await page.route('**/fixture/walk-traverse.gltf', (route) =>
    route.fulfill({ body: TRAVERSE, contentType: 'model/gltf+json' }),
  );
  const query = new URLSearchParams({ glb: TRAVERSE_URL, spawn, debug: '' });
  await page.goto(`/Who-Did-It/walk/?${query}`);
  await expect.poll(async () => (await state(page)).ready).toBe(true);
  await page.locator('#view').focus();
  return { state: await state(page), warnings };
}

/** Polls until `ok` holds and returns that state. */
async function until(page: Page, ok: (s: TraverseState) => boolean, timeout: number): Promise<TraverseState> {
  const seen: TraverseState[] = [];
  await expect
    .poll(
      async () => {
        seen[0] = await state(page);
        return ok(seen[0]);
      },
      { timeout, intervals: [100] },
    )
    .toBe(true);
  return seen[0]!;
}

const x = (s: TraverseState) => s.position![0];
const y = (s: TraverseState) => s.position![1];

test('crawls through the tunnel, sidles through the fissure, climbs onto the ledge and back down', async ({
  page,
}) => {
  // Real time, at about 6 fps under software WebGL: some 50 s of walking, crawling, sidling and climbing.
  test.setTimeout(180_000);
  const { state: s, warnings } = await open(page, 'start');
  expect(s.error).toBeNull();
  expect(s.zones).toEqual(['tunnel', 'fissure', 'face']);
  expect(s).toMatchObject({ spawn: 'start', mode: 'walk', eye: 1.6 });
  await expect(page.locator('.mode')).toBeHidden();

  // W into the tunnel's mouth: the crawl starts by itself, with its word on screen, and the eye goes down.
  await page.keyboard.down('KeyW');
  await until(page, (t) => t.mode === 'crawl', 15_000);
  await expect(page.locator('.mode')).toHaveText('Crawling');
  const low = await until(page, (t) => t.eye === 0.55, 5_000);
  expect(y(low)).toBeCloseTo(0, 2);
  // Out of the far end it stands up again and walks on to the fissure.
  await until(page, (t) => t.mode === 'walk' && x(t) > 4.5, 30_000);
  await until(page, (t) => t.eye === 1.6, 5_000);

  // The fissure: sideways by itself, the view turned to face one of its walls (yaw 0 or pi).
  await until(page, (t) => t.mode === 'sidle', 15_000);
  await expect(page.locator('.mode')).toHaveText('Sideways');
  await page.keyboard.up('KeyW');
  const facing = await until(page, (t) => Math.abs(Math.cos(t.yaw)) > 0.999, 5_000);
  // Facing north (yaw 0) east is to the right, D; facing south, A.
  const east = Math.cos(facing.yaw) > 0 ? 'KeyD' : 'KeyA';
  const west = east === 'KeyD' ? 'KeyA' : 'KeyD';
  await page.keyboard.down(east);
  await until(page, (t) => t.mode === 'walk' && x(t) > 15.4, 40_000);
  await expect(page.locator('.mode')).toBeHidden();

  // Held on, the same key walks east to the climb face and the walker hangs on it; W climbs it, whichever way the
  // view faces, and mantles onto the ledge.
  await until(page, (t) => t.mode === 'climb', 20_000);
  await page.keyboard.up(east);
  await expect(page.locator('.mode')).toHaveText('Climbing');
  await page.keyboard.down('KeyW');
  const top = await until(page, (t) => t.mode === 'walk' && y(t) > 3.9, 30_000);
  await page.keyboard.up('KeyW');
  expect(top.onGround).toBe(true);
  expect(x(top)).toBeGreaterThan(21.5);

  // Back off the edge: the face catches the walker, and S takes the walker down to the floor.
  await page.keyboard.down(west);
  const caught = await until(page, (t) => t.mode === 'climb', 15_000);
  await page.keyboard.up(west);
  expect(y(caught)).toBeGreaterThan(3.4);
  await page.keyboard.down('KeyS');
  const floor = await until(page, (t) => t.mode === 'walk' && y(t) < 0.05, 20_000);
  await page.keyboard.up('KeyS');
  expect(x(floor)).toBeLessThan(21);
  expect(warnings.filter((w) => w.includes('asks for'))).toEqual([]);
});

test('spawns with wdi_mode start in their modes: crawling in the tunnel, sideways in the fissure, on the face', async ({
  page,
}) => {
  const { state: s, warnings } = await open(page, 'tunnel');
  expect(s).toMatchObject({ spawn: 'tunnel', mode: 'crawl', zone: 'tunnel', eye: 0.55 });
  // On the tunnel's floor, not on its roof.
  expect(y(s)).toBeCloseTo(0, 3);
  await expect(page.locator('.mode')).toHaveText('Crawling');

  await page.locator('.picker select').selectOption('fissure');
  const sidle = await until(page, (t) => t.spawn === 'fissure', 5_000);
  expect(sidle).toMatchObject({ mode: 'sidle', zone: 'fissure', eye: 1.6 });
  // An arrival faces the wall at once.
  expect(Math.abs(Math.cos(sidle.yaw))).toBeGreaterThan(0.999);
  await expect(page.locator('.mode')).toHaveText('Sideways');

  await page.locator('.picker select').selectOption('face');
  const climb = await until(page, (t) => t.spawn === 'face', 5_000);
  expect(climb).toMatchObject({ mode: 'climb', zone: 'face' });
  expect(x(climb)).toBeCloseTo(20.65, 2);
  expect(y(climb)).toBeCloseTo(1, 2);
  await page.waitForTimeout(1000);
  expect(y(await state(page))).toBeCloseTo(1, 2);
  await expect(page.locator('.mode')).toHaveText('Climbing');

  await page.locator('.picker select').selectOption('start');
  await until(page, (t) => t.spawn === 'start' && t.mode === 'walk', 5_000);
  await expect(page.locator('.mode')).toBeHidden();
  expect(warnings.filter((w) => w.includes('asks for'))).toEqual([]);
});
