import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// The fixture (scripts/make-fixture.mjs) is served at a made-up URL and opened with ?glb=, as the real world will be.
const FIXTURE = readFileSync(fileURLToPath(new URL('../test/fixtures/walk-fixture.gltf', import.meta.url)));
const FIXTURE_URL = 'http://localhost:4174/fixture/walk-fixture.gltf';

interface WalkState {
  ready: boolean;
  error: string | null;
  spawns: string[];
  spawn: string | null;
  collisionSource: string | null;
  position: [number, number, number] | null;
  onGround: boolean;
}

function expectAt(p: [number, number, number] | null, at: [number, number, number]): void {
  expect(p).not.toBeNull();
  p!.forEach((v, i) => expect(v).toBeCloseTo(at[i]!, 3));
}

const state = (page: Page): Promise<WalkState> =>
  page.evaluate(() => (window as unknown as { __walk: WalkState }).__walk);

async function open(page: Page, spawn?: string): Promise<WalkState> {
  await page.route('**/fixture/walk-fixture.gltf', (route) =>
    route.fulfill({ body: FIXTURE, contentType: 'model/gltf+json' }),
  );
  const query = new URLSearchParams({ glb: FIXTURE_URL, debug: '' });
  if (spawn) query.set('spawn', spawn);
  await page.goto(`/Who-Did-It/walk/?${query}`);
  await expect.poll(async () => (await state(page)).ready).toBe(true);
  await page.locator('#view').focus();
  return state(page);
}

/** Holds a key until the position stops changing, and returns where it stopped. */
async function holdUntilStill(page: Page, key: string, seconds: number): Promise<[number, number, number]> {
  await page.keyboard.down(key);
  await page.waitForTimeout(seconds * 1000);
  const before = (await state(page)).position!;
  await page.waitForTimeout(500);
  const after = (await state(page)).position!;
  await page.keyboard.up(key);
  expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeLessThan(0.05);
  return after;
}

test('spawns on the square, walks forward and is stopped by the wall', async ({ page }) => {
  const s = await open(page);
  expect(s.error).toBeNull();
  expect(s.collisionSource).toBe('HM_Collision');
  expect(s.spawns).toEqual(['stairs', 'square']);
  expect(s.spawn).toBe('square');
  expectAt(s.position, [0, 0, -4]);
  await expect(page.locator('.picker select')).toHaveValue('square');
  await expect(page.locator('.hint')).toBeVisible();
  await expect(page.locator('.debug')).toContainText('collision: HM_Collision');

  // Walking at 1.4 m/s covers the 5.7 m to the wall in about 4 s; the wall's face is at z = -10.
  const [x, y, z] = await holdUntilStill(page, 'KeyW', 6);
  expect(x).toBeCloseTo(0, 1);
  expect(y).toBeCloseTo(0, 2);
  expect(z).toBeGreaterThan(-10);
  expect(z).toBeLessThan(-9.5);
});

test('climbs the stairs from the stairs spawn', async ({ page }) => {
  const s = await open(page, 'stairs');
  expect(s.spawn).toBe('stairs');
  // Facing +X, the stairs start 1.5 m ahead and rise 1.6 m to a platform that ends at x = 12.
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await state(page)).position![0], { timeout: 15_000 }).toBeGreaterThan(9.5);
  await page.keyboard.up('ArrowUp');
  const after = await state(page);
  expect(after.position![1]).toBeCloseTo(1.6, 2);
  expect(after.position![2]).toBeCloseTo(4.5, 1);
  expect(after.onGround).toBe(true);
});

test('the spawn picker moves the player', async ({ page }) => {
  await open(page);
  await page.locator('.picker select').selectOption('stairs');
  await expect.poll(async () => (await state(page)).spawn).toBe('stairs');
  expectAt((await state(page)).position, [4.5, 0, 4.5]);
});

test('a failed load says so', async ({ page }) => {
  await page.route('**/missing.glb', (route) => route.fulfill({ status: 404, body: 'nope' }));
  await page.goto('/Who-Did-It/walk/?glb=http://localhost:4174/missing.glb&debug');
  await expect(page.locator('.panel.error')).toContainText('Could not load');
});
