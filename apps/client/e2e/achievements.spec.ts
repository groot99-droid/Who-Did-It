import { expect, test, type Locator } from '@playwright/test';

// Round 10, E1 (GDD 3.28): the title screen's Trophies entry, read from the device record, on a phone and a desktop.

async function fits(el: Locator, width: number, height: number) {
  const box = await el.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);
  expect(box!.y + box!.height).toBeLessThanOrEqual(height + 0.5);
  const wide = await el.evaluate((root) =>
    [root, ...root.querySelectorAll<HTMLElement>('*')]
      .filter((e) => e.getClientRects().length > 0 && e.scrollWidth > e.clientWidth + 1)
      .filter((e) => !/auto|scroll/.test(getComputedStyle(e).overflowX))
      .map((e) => `${e.tagName.toLowerCase()}.${e.className}`)
      .slice(0, 5),
  );
  expect(wide, 'nothing in the dialog is cut off sideways').toEqual([]);
}

for (const [name, width, height, query] of [
  ['390w', 390, 844, '&touch=1'],
  ['1280x720', 1280, 720, ''],
] as const) {
  test.describe(`trophies at ${name}`, () => {
    test.beforeEach(async ({ page }) => page.setViewportSize({ width, height }));

    test('lists the trees from the device record, locks what is not grown yet', async ({ page }, info) => {
      await page.addInitScript(() => {
        localStorage.setItem('wdi:achv', JSON.stringify({ oddJobs: '2026-11-06' }));
      });
      await page.goto(`/Who-Did-It/?mock=1${query}`);
      await page.getByTestId('menu-trophies').click();
      const state = (id: string) =>
        page.locator(`[data-testid="achv-row"][data-id="${id}"]`).getAttribute('data-state');
      expect(await state('oddJobs')).toBe('earned');
      expect(await state('steadyHands')).toBe('open');
      expect(await state('townFixture')).toBe('locked');
      await expect(page.getByTestId('achv-tree')).toHaveCount(4);
      await fits(page.locator('.wdi-menu-dialog'), width, height);
      await page.screenshot({ path: info.outputPath(`trophies-${name}.png`), animations: 'disabled' });
    });

    test('an empty or blocked record shows nothing earned and still opens', async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('wdi:achv', '{broken'));
      await page.goto(`/Who-Did-It/?mock=1${query}`);
      await page.getByTestId('menu-trophies').click();
      await expect(page.locator('[data-testid="achv-row"][data-state="earned"]')).toHaveCount(0);
      await expect(page.getByTestId('achv-tree')).toHaveCount(4);
    });
  });
}
