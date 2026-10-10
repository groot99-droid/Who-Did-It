import { expect, test } from '@playwright/test';

// The World scene against the ?mock=1 world feed: lobby -> role card -> village, walking and a door.

async function toWorld(page: import('@playwright/test').Page, query = '') {
  await page.goto(`/Who-Did-It/?mock=1${query}`);
  await page.getByLabel('Your name').fill('Hana');
  await page.getByRole('button', { name: 'Create Party' }).click();
  await expect(page.getByTestId('player-list')).toContainText('Hana');
  await expect(page.getByTestId('start')).toBeEnabled();
  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await page.getByTestId('ready').click();
  await expect(page.locator('.wdi-timer')).toBeVisible();
}

test('the village shows the HUD, six bots in view, and the player can walk', async ({ page }, info) => {
  await toWorld(page, '&fps=1');
  await expect(page.locator('.wdi-fps')).toContainText('7 in view');
  await expect(page.locator('.wdi-fps')).toContainText('overworld');
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('village.png') });
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyS');
  await page.screenshot({ path: info.outputPath('village-walked.png') });
});

test('the touch controls appear with ?touch=1', async ({ page }) => {
  await toWorld(page, '&touch=1');
  await expect(page.locator('.wdi-stick')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use' })).toBeVisible();
});

test('walking to the tavern door and pressing E enters the bar, and back out again', async ({
  page,
}, info) => {
  await toWorld(page, '&fps=1');
  const fps = page.locator('.wdi-fps');
  // From the first square spawn straight south to the lane in front of the tavern door, then use it.
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyA'); // one tile west: the square spawn column is walled in lower down
  await page.waitForTimeout(250);
  await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(3000);
  await page.keyboard.up('KeyS');
  await page.keyboard.up('Space');
  await page.screenshot({ path: info.outputPath('at-door.png') });
  await page.keyboard.press('KeyE');
  await expect(fps).toContainText('tavern_bar', { timeout: 5000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('in-bar.png') });
  // Arrives beside tb.front on the west wall; the door is one step west, so walk into it and use it.
  await page.waitForTimeout(700);
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyA');
  await page.keyboard.press('KeyE');
  await expect(fps).toContainText('overworld', { timeout: 5000 });
});

test('the world fills a phone-sized window and follows a rotation', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toWorld(page, '&touch=1');
  await page.waitForTimeout(600);
  const portrait = await page.locator('canvas').evaluate((c) => [c.clientWidth, c.clientHeight]);
  expect(portrait[0]).toBeGreaterThan(380);
  expect(portrait[1]).toBeGreaterThan(800);
  await page.screenshot({ path: info.outputPath('portrait.png') });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(600);
  const landscape = await page.locator('canvas').evaluate((c) => [c.clientWidth, c.clientHeight]);
  expect(landscape[0]).toBeGreaterThan(830);
  expect(landscape[1]).toBeGreaterThan(380);
  await page.screenshot({ path: info.outputPath('landscape.png') });
});
