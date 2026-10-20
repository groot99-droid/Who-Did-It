import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// The art-style switch (A79) on the mocks, with a tiny fixture low-poly manifest: the match stays up, the textures
// change by key, and a failed swap keeps the old style. The 8-bit root manifest is real plus two fixture images (a
// 4 px tile and a 4 px kitchen); the low-poly fixture re-skins both at 8 px with the `linear` filter.

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)));
const PNG = { 'content-type': 'image/png' };

interface Probe {
  width: number;
  scale: number;
}
interface TestGame {
  textures: {
    exists(k: string): boolean;
    get(k: string): { getSourceImage(): { width: number }; source: Array<{ scaleMode: number }> };
  };
  scene: { isActive(k: string): boolean };
}
declare global {
  interface Window {
    __wdiGame?: TestGame;
  }
}

async function fixtures(page: Page, opts: { lowpoly: boolean } = { lowpoly: true }): Promise<void> {
  await page.route('**/assets/manifest.json', async (route) => {
    const body = (await (await route.fetch()).json()) as { entries: unknown[] };
    // The fixture tile replaces the real tiles_grass entry.
    body.entries = body.entries.filter((e) => (e as { key: string }).key !== 'tiles_grass');
    body.entries.push(
      { key: 'tiles_grass', type: 'image', url: 'e2e/tiles_grass.png', filter: 'nearest' },
      { key: 'onub_kitchen', type: 'image', url: 'e2e/onub_kitchen.png', filter: 'nearest', modes: ['onub'] },
    );
    await route.fulfill({ json: body });
  });
  await page.route('**/assets/e2e/tiles_grass.png', (r) =>
    r.fulfill({ body: fixture('tiles_grass_8bit.png'), headers: PNG }),
  );
  await page.route('**/assets/e2e/onub_kitchen.png', (r) =>
    r.fulfill({ body: fixture('onub_kitchen_8bit.png'), headers: PNG }),
  );
  if (!opts.lowpoly) {
    // The manifest loads but its image does not: the swap fails and the old textures stay.
    await page.route('**/assets/lowpoly/manifest.json', (r) =>
      r.fulfill({ body: fixture('lowpoly/manifest.json'), headers: { 'content-type': 'application/json' } }),
    );
    await page.route('**/assets/lowpoly/*.png', (r) => r.fulfill({ status: 404, body: 'no' }));
    return;
  }
  await page.route('**/assets/lowpoly/manifest.json', (r) =>
    r.fulfill({ body: fixture('lowpoly/manifest.json'), headers: { 'content-type': 'application/json' } }),
  );
  await page.route('**/assets/lowpoly/*.png', (r) =>
    r.fulfill({ body: fixture(`lowpoly/${r.request().url().split('/').pop()}`), headers: PNG }),
  );
}

const probe = (page: Page, key: string): Promise<Probe> =>
  page.evaluate((k) => {
    const t = window.__wdiGame!.textures.get(k);
    return { width: t.getSourceImage().width, scale: t.source[0]!.scaleMode };
  }, key);

const active = (page: Page, scene: string) =>
  page.evaluate((s) => window.__wdiGame!.scene.isActive(s), scene);

async function toWorld(page: Page, query = ''): Promise<void> {
  await page.goto(`/Who-Did-It/?mock=1${query}`);
  await page.getByLabel('Your name').fill('Hana');
  await page.getByRole('button', { name: 'Create Party' }).click();
  await expect(page.getByTestId('start')).toBeEnabled();
  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await page.getByTestId('ready').click();
  await expect(page.getByTestId('hud-clock')).toBeVisible();
}

test('the lobby offers 8-bit, low poly and a disabled HD', async ({ page }) => {
  await fixtures(page);
  await page.goto('/Who-Did-It/?mock=1');
  await page.getByLabel('Your name').fill('Hana');
  await page.getByRole('button', { name: 'Create Party' }).click();
  const sw = page.getByTestId('lobby-settings').getByTestId('art-style');
  await expect(sw.getByTestId('art-style-8bit')).toHaveAttribute('aria-checked', 'true');
  await expect(sw.getByTestId('art-style-lowpoly')).toHaveAttribute('aria-checked', 'false');
  await expect(sw.getByTestId('art-style-hd')).toBeDisabled();
  await expect(sw).toContainText('Coming later');
  // Keyboard: focus the checked radio and arrow to the next.
  await sw.getByTestId('art-style-8bit').focus();
  await page.keyboard.press('ArrowRight');
  await expect(sw.getByTestId('art-style-lowpoly')).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => localStorage.getItem('wdi.artStyle'))).toBe('lowpoly');
});

test('switching in the world swaps the textures and keeps the match', async ({ page }) => {
  await fixtures(page);
  await toWorld(page);
  expect(await active(page, 'World')).toBe(true);
  const before = await probe(page, 'tiles_grass');
  expect(before.width).toBe(4);
  await page.getByTestId('hud').getByTestId('art-style-lowpoly').click();
  await expect(page.locator('html')).toHaveAttribute('data-art-style', 'lowpoly');
  await expect.poll(() => probe(page, 'tiles_grass').then((p) => p.width)).toBe(8);
  const after = await probe(page, 'tiles_grass');
  expect(after.scale).not.toBe(before.scale);
  // Still in the match: the World runs again over the same connection and the HUD is back.
  await expect(page.getByTestId('hud-clock')).toBeVisible();
  await expect.poll(() => active(page, 'World')).toBe(true);
  expect(await active(page, 'Landing')).toBe(false);
  expect(await active(page, 'Lobby')).toBe(false);
  await expect(page.getByTestId('hud').getByTestId('art-style-lowpoly')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // And back.
  await page.getByTestId('hud').getByTestId('art-style-8bit').click();
  await expect.poll(() => probe(page, 'tiles_grass').then((p) => p.width)).toBe(4);
  expect((await probe(page, 'tiles_grass')).scale).toBe(before.scale);
});

test('switching in a quick-mode scene swaps the kitchen', async ({ page }) => {
  await fixtures(page);
  await page.goto('/Who-Did-It/?mock=1&mode=onub&speed=2');
  await page.getByLabel('Your name').fill('Hana');
  await page.getByRole('button', { name: 'Create Party' }).click();
  await expect(page.getByTestId('start')).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await page.getByTestId('ready').click();
  await expect(page.getByTestId('kitchen')).toBeVisible({ timeout: 20_000 });
  expect((await probe(page, 'onub_kitchen')).width).toBe(4);
  await page.getByTestId('art-style-lowpoly').click();
  await expect.poll(() => probe(page, 'onub_kitchen').then((p) => p.width)).toBe(8);
  await expect(page.getByTestId('kitchen')).toBeVisible();
  expect(await active(page, 'Kitchen')).toBe(true);
});

test('a failed swap stays on the old style and says so', async ({ page }) => {
  await fixtures(page, { lowpoly: false });
  await toWorld(page);
  await page.getByTestId('hud').getByTestId('art-style-lowpoly').click();
  await expect(page.getByTestId('art-notice')).toBeVisible();
  await expect(page.getByTestId('hud').getByTestId('art-style-8bit')).toHaveAttribute('aria-checked', 'true');
  expect((await probe(page, 'tiles_grass')).width).toBe(4);
  expect(await active(page, 'World')).toBe(true);
  await expect(page.getByTestId('hud-clock')).toBeVisible();
});
