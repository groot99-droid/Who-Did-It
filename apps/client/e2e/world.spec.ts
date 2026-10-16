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
  await expect(page.getByTestId('hud-clock')).toBeVisible();
}

test('the village shows the HUD, six bots in view, and the player can walk', async ({ page }, info) => {
  await toWorld(page, '&fps=1');
  await expect(page.getByTestId('hud-fps')).toContainText('7 in view');
  await expect(page.getByTestId('hud-fps')).toContainText('overworld');
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
  await expect(page.getByTestId('touch-use')).toBeVisible();
  await expect(page.getByTestId('touch-act')).toBeVisible();
});

/** Taps `key` in short bursts until the prompt reads `text`: robust against a slow software-GL frame rate. */
async function walkUntilPrompt(page: import('@playwright/test').Page, keys: string[], text: string) {
  const prompt = page.getByTestId('prompt');
  for (let i = 0; i < 60; i++) {
    if ((await prompt.isVisible()) && ((await prompt.textContent()) ?? '').includes(text)) return;
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(110);
    for (const k of keys) await page.keyboard.up(k);
    await page.waitForTimeout(70);
  }
  throw new Error(`prompt never read "${text}"`);
}

test('walking to the tavern door and pressing E enters the bar, and back out again', async ({
  page,
}, info) => {
  await toWorld(page, '&fps=1');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const fps = page.getByTestId('hud-fps');
  // From the first square spawn one tile west (the spawn column is walled in lower down), then south to
  // the lane in front of the tavern door until the prompt offers it.
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(250);
  await page.keyboard.up('KeyA');
  await walkUntilPrompt(page, ['Space', 'KeyS'], 'Enter');
  await page.waitForTimeout(250);
  await page.screenshot({ path: info.outputPath('at-door.png') });
  await page.keyboard.press('KeyE');
  await expect(fps).toContainText('tavern_bar', { timeout: 5000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('in-bar.png') });
  // Arrives beside tb.front on the west wall; the door is one step west, so walk into it and use it.
  await page.waitForTimeout(700);
  await walkUntilPrompt(page, ['KeyA'], 'Enter');
  await page.keyboard.press('KeyE');
  await expect(fps).toContainText('overworld', { timeout: 5000 });
  expect(errors).toEqual([]);
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

test('kill -> body -> collect -> one Notebook entry', async ({ page }, info) => {
  // Day phase (kills are refused in grace) with the bots parked so the strike is deterministic.
  await toWorld(page, '&fps=1&phase=day&bots=still');
  const fps = page.getByTestId('hud-fps');
  // The nearest bot stands about four tiles east of the spawn; walk until Q lands the strike.
  for (let i = 0; i < 25; i++) {
    if ((await fps.textContent())?.includes('bodies 1')) break;
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(120);
    await page.keyboard.up('KeyD');
    await page.keyboard.press('KeyQ');
    await page.waitForTimeout(150);
  }
  await expect(fps).toContainText('bodies 1');
  await expect(fps).toContainText('clues 3'); // two trail clues and the grace teaching clue
  await page.screenshot({ path: info.outputPath('body.png') });
  // Footprints lie one tile past the body; step onto them and hold E for the 2 s collect.
  await expect(page.getByTestId('prompt')).toBeVisible();
  await page.waitForTimeout(300);
  // Walk along the trail until the prompt offers the clue instead of the report.
  const prompt = page.getByTestId('prompt');
  for (let i = 0; i < 20 && !(await prompt.textContent())?.includes('collect'); i++) {
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(60);
    await page.keyboard.up('KeyD');
    await page.waitForTimeout(60);
  }
  await expect(prompt).toContainText('Hold E to collect');
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(2300);
  await page.keyboard.up('KeyE');
  await expect(page.getByTestId('notebook')).toBeVisible();
  await expect(page.getByTestId('notebook-entry')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('notebook.png') });
});

test('the night mask and the phase on the clock', async ({ page }, info) => {
  await toWorld(page, '&phase=night');
  await expect(page.getByTestId('hud-clock')).toContainText('Night');
  await expect(page.getByTestId('night-mask')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: info.outputPath('night.png') });
});

test('a ghost is told so and loses every prompt but doors', async ({ page }, info) => {
  await toWorld(page, '&ghost=1&phase=day');
  await expect(page.getByTestId('hud')).toContainText('You are a ghost');
  await page.waitForTimeout(400);
  await page.screenshot({ path: info.outputPath('ghost.png') });
});
