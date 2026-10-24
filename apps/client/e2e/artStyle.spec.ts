import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { createParty } from './fixtures/party';

// The art-style switch (A79) on the mocks, with tiny fixture low-poly and HD manifests: the match stays up, the
// textures change by key, and a failed swap keeps the old style. The 8-bit root manifest is real plus a fixture
// image (a 4 px tile); the low-poly fixture re-skins it at 8 px with the `linear` filter, and the HD fixture at
// 8 px with `texels: 2` (A164). HD is gated on the device (art.md 3): the tests shape the browser's answers.

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

/** The device the gate sees: a desktop that holds HD, or a phone that does not (GDD 3.13). */
async function device(page: Page, kind: 'desktop' | 'phone'): Promise<void> {
  const screenHeight = kind === 'desktop' ? 1080 : 844;
  await page.addInitScript((h) => {
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8, configurable: true });
    Object.defineProperty(Screen.prototype, 'height', { get: () => h, configurable: true });
  }, screenHeight);
}

async function fixtures(page: Page, opts: { lowpoly: boolean } = { lowpoly: true }): Promise<void> {
  await page.route('**/assets/hd/manifest.json', (r) =>
    r.fulfill({ body: fixture('hd/manifest.json'), headers: { 'content-type': 'application/json' } }),
  );
  await page.route('**/assets/hd/*.png', (r) =>
    r.fulfill({ body: fixture(`hd/${r.request().url().split('/').pop()}`), headers: PNG }),
  );
  await page.route('**/assets/manifest.json', async (route) => {
    const body = (await (await route.fetch()).json()) as { entries: unknown[] };
    // The fixture image replaces the real tiles_grass entry.
    body.entries = body.entries.filter((e) => (e as { key: string }).key !== 'tiles_grass');
    body.entries.push({ key: 'tiles_grass', type: 'image', url: 'e2e/tiles_grass.png', filter: 'nearest' });
    await route.fulfill({ json: body });
  });
  await page.route('**/assets/e2e/tiles_grass.png', (r) =>
    r.fulfill({ body: fixture('tiles_grass_8bit.png'), headers: PNG }),
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
  await createParty(page, 'Hana');
  await expect(page.getByTestId('start')).toBeEnabled();
  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await page.getByTestId('ready').click();
  await expect(page.getByTestId('hud-clock')).toBeVisible();
}

test('the lobby offers 8-bit, low poly and HD on a desktop', async ({ page }) => {
  await device(page, 'desktop');
  await fixtures(page);
  await page.goto('/Who-Did-It/?mock=1');
  await createParty(page, 'Hana');
  const sw = page.getByTestId('lobby-settings').getByTestId('art-style');
  await expect(sw.getByTestId('art-style-8bit')).toHaveAttribute('aria-checked', 'true');
  await expect(sw.getByTestId('art-style-lowpoly')).toHaveAttribute('aria-checked', 'false');
  await expect(sw.getByTestId('art-style-hd')).toBeEnabled();
  await expect(sw).not.toContainText('Needs');
  // Keyboard: focus the checked radio and arrow to the next.
  await sw.getByTestId('art-style-8bit').focus();
  await page.keyboard.press('ArrowRight');
  await expect(sw.getByTestId('art-style-lowpoly')).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => localStorage.getItem('wdi.artStyle'))).toBe('lowpoly');
});

test('a phone sees HD disabled with the reason, and a stored HD pick falls back', async ({ page }) => {
  await device(page, 'phone');
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  await page.goto('/Who-Did-It/?mock=1');
  await page.evaluate(() => localStorage.setItem('wdi.artStyle', 'hd'));
  await page.goto('/Who-Did-It/?mock=1&art=hd');
  await createParty(page, 'Hana');
  const sw = page.getByTestId('lobby-settings').getByTestId('art-style');
  await expect(sw.getByTestId('art-style-hd')).toBeDisabled();
  await expect(sw.getByTestId('art-style-hd')).toHaveAttribute('title', 'Needs a larger screen');
  await expect(sw).toContainText('Needs a larger screen');
  await expect(sw.getByTestId('art-style-8bit')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-art-style', '8bit');
  // Arrowing from low poly wraps past the disabled HD back to 8-bit.
  await sw.getByTestId('art-style-lowpoly').click();
  await expect(page.locator('html')).toHaveAttribute('data-art-style', 'lowpoly');
  await expect(page.getByTestId('art-veil')).toBeHidden();
  await expect(sw.getByTestId('art-style-lowpoly')).toHaveAttribute('aria-checked', 'true');
  await sw.getByTestId('art-style-lowpoly').focus();
  await page.keyboard.press('ArrowRight');
  await expect(sw.getByTestId('art-style-8bit')).toHaveAttribute('aria-checked', 'true');
});

test('HD loads only when picked, swaps mid-match at its texel factor, and swaps back', async ({ page }) => {
  await device(page, 'desktop');
  await fixtures(page);
  const hdRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/assets/hd/')) hdRequests.push(r.url());
  });
  await toWorld(page);
  // Lazy: nothing under assets/hd/ is fetched before the pick.
  expect(hdRequests).toEqual([]);
  const before = await probe(page, 'tiles_grass');
  expect(before.width).toBe(4);
  await page.getByTestId('hud').getByTestId('art-style-hd').click();
  await expect(page.locator('html')).toHaveAttribute('data-art-style', 'hd');
  await expect.poll(() => probe(page, 'tiles_grass').then((p) => p.width)).toBe(8);
  expect(hdRequests.some((u) => u.endsWith('/assets/hd/manifest.json'))).toBe(true);
  expect(hdRequests.some((u) => u.endsWith('/assets/hd/tiles_grass.png'))).toBe(true);
  await expect(page.getByTestId('hud-clock')).toBeVisible();
  await expect.poll(() => active(page, 'World')).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('wdi.artStyle'))).toBe('hd');
  // And back to 8-bit mid-match.
  await page.getByTestId('hud').getByTestId('art-style-8bit').click();
  await expect(page.locator('html')).toHaveAttribute('data-art-style', '8bit');
  await expect.poll(() => probe(page, 'tiles_grass').then((p) => p.width)).toBe(4);
  await expect(page.getByTestId('hud-clock')).toBeVisible();
  expect(await active(page, 'World')).toBe(true);
});

test('switching in the world swaps the textures and keeps the match', async ({ page }) => {
  await device(page, 'desktop');
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

test('a failed swap stays on the old style and says so', async ({ page }) => {
  await device(page, 'desktop');
  await fixtures(page, { lowpoly: false });
  await toWorld(page);
  await page.getByTestId('hud').getByTestId('art-style-lowpoly').click();
  await expect(page.getByTestId('art-notice')).toBeVisible();
  await expect(page.getByTestId('hud').getByTestId('art-style-8bit')).toHaveAttribute('aria-checked', 'true');
  expect((await probe(page, 'tiles_grass')).width).toBe(4);
  expect(await active(page, 'World')).toBe(true);
  await expect(page.getByTestId('hud-clock')).toBeVisible();
});
