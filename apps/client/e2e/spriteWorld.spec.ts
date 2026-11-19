import { expect, test, type Page } from '@playwright/test';
import { createParty } from './fixtures/party';

// Round 11, R1 (A618): `?render=sprite` lays the Three.js sprite world under the Phaser canvas, from its own chunk.

async function toWorld(page: Page, query: string): Promise<string[]> {
  const scripts: string[] = [];
  page.on('request', (r) => void (r.resourceType() === 'script' && scripts.push(r.url())));
  await page.goto(`/Who-Did-It/?mock=1${query}`);
  await createParty(page, 'Hana');
  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await page.getByTestId('ready').click();
  await expect(page.getByTestId('hud-clock')).toBeVisible();
  return scripts.filter((u) => /\/(three|world3)-[\w-]+\.js$/.test(u));
}

test('the sprite world lies under the Phaser canvas with ?render=sprite', async ({ page }) => {
  expect(await toWorld(page, '&render=sprite')).toHaveLength(2);
  await expect(page.locator('#game canvas')).toHaveCount(2);
  const [under, over] = await page.$$eval('#game canvas', (cs) =>
    cs.map((c) => ({ ...c.getBoundingClientRect().toJSON(), z: Number(getComputedStyle(c).zIndex) })),
  );
  expect(under.z).toBeLessThan(over.z);
  expect(under.width).toBeGreaterThan(0);
  for (const k of ['x', 'y', 'width', 'height']) expect(under[k]).toBe(over[k]);
});

test('a default load fetches neither the sprite world nor Three.js', async ({ page }) => {
  expect(await toWorld(page, '')).toEqual([]);
  await expect(page.locator('#game canvas')).toHaveCount(1);
});

test('the turn keys turn the sprite world, and the compass shows it (R2)', async ({ page }) => {
  await toWorld(page, '&render=sprite');
  const compass = page.locator('.wdi-compass');
  await expect(compass).toBeVisible();
  await expect(compass).toHaveAttribute('data-heading', '0');
  await page.keyboard.press('Period');
  await expect(compass).toHaveAttribute('data-heading', '1');
  await page.keyboard.press('Comma');
  await page.keyboard.press('Comma');
  await expect(compass).toHaveAttribute('data-heading', '3');
});
