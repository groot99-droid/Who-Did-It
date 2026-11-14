import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// The rooms fixture (scripts/make-fixture.mjs): walk from the square through the widow's door into her bedroom,
// then use the door back out.
const ROOMS = readFileSync(fileURLToPath(new URL('../test/fixtures/walk-rooms.gltf', import.meta.url)));

interface RoomsState {
  ready: boolean;
  spawn: string | null;
  area: string | null;
  indoor: boolean;
  exposure: number;
  trip: { portal: string; spawn: string | null; fallback: boolean } | null;
}

const state = (page: Page): Promise<RoomsState> =>
  page.evaluate(() => (window as unknown as { __walk: RoomsState }).__walk);

test('walks through the widow door into her room and uses the door back out', async ({ page }) => {
  await page.route('**/fixture/walk-rooms.gltf', (route) =>
    route.fulfill({ body: ROOMS, contentType: 'model/gltf+json' }),
  );
  const query = new URLSearchParams({ glb: 'http://localhost:4174/fixture/walk-rooms.gltf', debug: '' });
  await page.goto(`/Who-Did-It/walk/?${query}`);
  await expect.poll(async () => (await state(page)).ready).toBe(true);
  expect(await state(page)).toMatchObject({ spawn: 'square', area: 'Area_village', indoor: false });
  await expect(page.locator('.picker optgroup')).toHaveCount(2);
  await expect(page.locator('.picker optgroup').first()).toHaveAttribute('label', 'Village');

  await page.locator('#view').focus();
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await state(page)).trip?.portal, { intervals: [50] }).toBe('widow_door');
  await page.keyboard.up('KeyW');
  await expect.poll(async () => (await state(page)).spawn).toBe('widow_bedroom_door');
  const inside = await state(page);
  expect(inside).toMatchObject({ area: 'Area_room_widow_bedroom', indoor: true, exposure: 1.5 });
  expect(inside.trip).toEqual({ portal: 'widow_door', spawn: 'widow_bedroom_door', fallback: false });
  await expect(page.locator('.picker select')).toHaveValue('widow_bedroom_door');

  // 1.3 m from the way out: too far to walk through, near enough to use.
  await expect(page.locator('.door')).toBeVisible();
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await state(page)).spawn).toBe('overworld_widow_door');
  expect(await state(page)).toMatchObject({ area: 'Area_village', indoor: false, exposure: 2.38 });
});
