import { expect, test, type Locator, type Page } from '@playwright/test';
import { createParty } from './fixtures/party';

// Round 10, 10Y (UI.md 12): the round's new screens on a phone and on a desktop. The inventory grid and the crafting
// square (A13, UI.md 14.44) open from the `?m5b=1` kit; `window.__wdiMock.sleep` and `.line` stand the mock feed in
// the states the server's private view would send for the asleep veil (A8, 14.46) and On the line (C1b, 14.47);
// `?minigame=lockpick` opens the lock-pick (D5b, 14.48) without a server. Every screen must sit inside the viewport
// with nothing cut off, and each run writes the set that `docs/ui` keeps (`<screen>-390w.png`, `<screen>-1280x720.png`).

interface Mock {
  sleep(asleep: boolean, inBed?: number, inBedOf?: number): void;
  line(on: boolean, cause?: string, round?: number): void;
}

async function toWorld(page: Page, query: string) {
  await page.goto(`/Who-Did-It/?mock=1${query}`);
  await createParty(page, 'Hana');
  await expect(page.getByTestId('player-list')).toContainText('Hana');
  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await page.getByTestId('ready').click();
  await expect(page.getByTestId('hud-clock')).toBeVisible();
}

const sleep = (page: Page, asleep: boolean, inBed = 0, inBedOf = 0) =>
  page.evaluate(([a, b, c]) => (window as unknown as { __wdiMock: Mock }).__wdiMock.sleep(a, b, c), [
    asleep,
    inBed,
    inBedOf,
  ] as const);
const line = (page: Page, on: boolean, cause?: string, round?: number) =>
  page.evaluate(([o, c, r]) => (window as unknown as { __wdiMock: Mock }).__wdiMock.line(o, c, r), [
    on,
    cause,
    round,
  ] as const);

/** The screen sits inside the viewport, and nothing visible in it is wider than the box it was given. */
async function fits(el: Locator, width: number, height: number) {
  const box = await el.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-0.5);
  expect(box!.y).toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);
  expect(box!.y + box!.height).toBeLessThanOrEqual(height + 0.5);
  const wide = await el.evaluate((root) =>
    [root, ...root.querySelectorAll<HTMLElement>('*')]
      .filter((e) => e.getClientRects().length > 0 && e.scrollWidth > e.clientWidth + 1)
      .filter((e) => !/auto|scroll/.test(getComputedStyle(e).overflowX))
      .map((e) => `${e.tagName.toLowerCase()}.${e.className}`)
      .slice(0, 5),
  );
  expect(wide, 'nothing in the screen is cut off sideways').toEqual([]);
}

for (const [name, width, height, query] of [
  ['390w', 390, 844, '&touch=1'],
  ['1280x720', 1280, 720, ''],
] as const) {
  test.describe(`at ${name}`, () => {
    test.beforeEach(async ({ page }) => page.setViewportSize({ width, height }));

    test('the inventory grid and the crafting square', async ({ page }, info) => {
      await toWorld(page, `&m5b=1${query}`);
      await page.getByTestId('m5b-inv').click();
      const inv = page.getByTestId('inventory');
      await expect(inv).toBeVisible();
      await expect(page.getByTestId('inventory-item-spade')).toBeVisible();
      await expect(page.getByTestId('inventory-count')).toContainText('slots');
      await fits(inv, width, height);
      await page.screenshot({ path: info.outputPath(`inventory-${name}.png`), animations: 'disabled' });

      // The crafting square lives at the foot of the Pockets screen (UI.md 14.44): 2 by 2, then 3 by 3.
      const grid = page.getByTestId('craftgrid');
      await grid.scrollIntoViewIfNeeded();
      await expect(grid).toBeVisible();
      await expect(page.getByTestId('craftgrid-cells').locator('button')).toHaveCount(4);
      await page.getByTestId('craftgrid-size').click();
      await expect(page.getByTestId('craftgrid-cells').locator('button')).toHaveCount(9);
      await fits(grid, width, height);
      await page.screenshot({ path: info.outputPath(`crafting-${name}.png`), animations: 'disabled' });
      await page.getByTestId('inventory-close').click();

      // The recipe list of the Craft key is the older panel; it still opens and fits.
      await page.getByTestId('m5b-craft').click();
      const craft = page.getByTestId('crafting');
      await expect(craft).toBeVisible();
      await fits(craft, width, height);
      await page.getByTestId('crafting-close').click();
    });

    test('the asleep veil and On the line', async ({ page }, info) => {
      await toWorld(page, query);
      await sleep(page, true, 2, 5);
      const veil = page.getByTestId('sleep-veil');
      await expect(veil).toBeVisible();
      await expect(veil).toContainText('Asleep');
      await expect(page.getByTestId('sleep-count')).toHaveText('2 of 5 in bed');
      await fits(veil, width, height);
      await page.screenshot({ path: info.outputPath(`asleep-${name}.png`), animations: 'disabled' });
      await sleep(page, false);
      await expect(veil).toBeHidden();

      await line(page, true, 'wolf');
      const screen = page.getByTestId('on-the-line');
      await expect(screen).toBeVisible();
      await expect(screen).toContainText('A wolf took you in HollowMere.'); // y13: the place of the own killed
      await expect(page.getByTestId('line-clock')).toHaveText(/^The train in \d+:\d\d$/);
      // y13: the book, read only: the Notebook and the quests, and not one button on the screen
      await expect(screen.getByTestId('notebook')).toBeVisible();
      await expect(screen.getByTestId('line-quests')).toContainText('You hold no work.');
      await expect(screen.locator('button')).toHaveCount(0);
      await fits(screen, width, height);
      await page.screenshot({ path: info.outputPath(`line-${name}.png`), animations: 'disabled' });
      await line(page, true, undefined, 12); // the last cycle (`finalNight.afterCycle`): the bells, not a train
      await expect(page.getByTestId('line-clock')).toHaveText(/^The bells in \d+:\d\d$/);
      await line(page, false);
      await expect(screen).toHaveCount(0);
      await expect(page.locator('.wdi-toast', { hasText: 'You are back.' })).toBeVisible();
    });

    test('the lock-pick, its tension and its snap', async ({ page }, info) => {
      await toWorld(page, `&minigame=lockpick${query}`);
      const board = page.getByTestId('minigame');
      await expect(board).toHaveAttribute('data-kind', 'lockpick');
      const status = page.getByTestId('minigame-lockpick-status');
      await expect(status).toHaveText('0 of 3 pins set');
      await fits(board, width, height);
      // A pin half lifted, so the block shows off its track.
      for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowUp');
      await page.screenshot({ path: info.outputPath(`lockpick-${name}.png`), animations: 'disabled' });

      // A light press and a release is an attempt: the pin sets or slips back, the pick holds.
      await page.keyboard.down('Space');
      await page.waitForTimeout(500);
      await page.keyboard.up('Space');
      await expect(status).toHaveText(/^(It slips back\.|1 of 3 pins set)$/);
      // Held past the snap line, the pick snaps without a release.
      await page.keyboard.down('Space');
      await expect(status).toHaveText('The pick snaps.', { timeout: 5000 });
      await page.keyboard.up('Space');
    });
  });
}
