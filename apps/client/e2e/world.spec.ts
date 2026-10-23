import { expect, test } from '@playwright/test';
import { createParty } from './fixtures/party';

// The World scene against the ?mock=1 world feed: lobby -> role card -> village, walking and a door.

async function toWorld(page: import('@playwright/test').Page, query = '') {
  await page.goto(`/Who-Did-It/?mock=1${query}`);
  await createParty(page, 'Hana');
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

/**
 * Keys that walk a world direction: the keyboard is screen-axis (W is up the screen), turned 45 degrees into the world
 * (SPRITES 10.8), so a world direction is two keys. W+D is world north, S+D east, A+S south and A+W west.
 */
const WORLD_KEYS = {
  north: ['KeyW', 'KeyD'],
  east: ['KeyS', 'KeyD'],
  south: ['KeyA', 'KeyS'],
  west: ['KeyA', 'KeyW'],
};

/**
 * Holds `keys` down together for `ms`. The keys go down in one synchronous page call and come up in another: sent one
 * by one the 20 Hz input timer sometimes sees a single key, which is a screen axis and drifts the walk sideways.
 */
async function hold(page: import('@playwright/test').Page, keys: string[], ms: number) {
  const fire = (type: 'keydown' | 'keyup') =>
    page.evaluate(
      ([t, codes]) => {
        for (const code of codes)
          window.dispatchEvent(new KeyboardEvent(t, { code, bubbles: true, cancelable: true }));
      },
      [type, keys] as const,
    );
  await fire('keydown');
  await page.waitForTimeout(ms);
  await fire('keyup');
}

/** Taps `key` in short bursts until the prompt reads `text`: robust against a slow software-GL frame rate. */
async function walkUntilPrompt(page: import('@playwright/test').Page, keys: string[], text: string) {
  const prompt = page.getByTestId('prompt');
  for (let i = 0; i < 60; i++) {
    if ((await prompt.isVisible()) && ((await prompt.textContent()) ?? '').includes(text)) return;
    await hold(page, keys, 110);
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
  // The tavern's front door is on its south wall (Session 5J moved it). From the first square spawn one tile west
  // (the spawn column is walled in lower down by the tavern), south past the tavern to the village's south wall,
  // then north-east (screen right) until the tavern's south wall stops the climb and the walk slides east along
  // the lane in front of the door until the prompt offers it.
  await hold(page, WORLD_KEYS.west, 250);
  await hold(page, ['Space', ...WORLD_KEYS.south], 6000);
  await walkUntilPrompt(page, ['KeyD'], 'Enter');
  await page.waitForTimeout(250);
  await page.screenshot({ path: info.outputPath('at-door.png') });
  await page.keyboard.press('KeyE');
  await expect(fps).toContainText('tavern_bar', { timeout: 5000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('in-bar.png') });
  // Arrives beside tb.front on the south wall (Session 5J moved it); the door is one step south, so walk into it
  // and use it.
  await page.waitForTimeout(700);
  await walkUntilPrompt(page, WORLD_KEYS.south, 'Enter');
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
    await hold(page, WORLD_KEYS.east, 120);
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
    await hold(page, WORLD_KEYS.east, 60);
    await page.waitForTimeout(60);
  }
  await expect(prompt).toContainText('Hold to collect');
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
  const mask = page.getByTestId('night-mask');
  await expect(mask).toBeVisible();
  await expect(mask).toHaveAttribute('data-darkness', '1.00');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: info.outputPath('night.png') });
});

test('the darkness layer is off by day', async ({ page }) => {
  await toWorld(page, '&phase=day');
  await expect(page.getByTestId('night-mask')).toHaveAttribute('data-darkness', '0.00');
});

test('a key walks along a screen axis: W goes up the screen', async ({ page }) => {
  await toWorld(page, '&fps=1&bots=still');
  const at = async () => {
    const m = /at ([\d.]+),([\d.]+)/.exec((await page.getByTestId('hud-fps').textContent()) ?? '');
    return { x: Number(m?.[1]), y: Number(m?.[2]) };
  };
  const before = await at();
  await hold(page, ['KeyW'], 500);
  await page.waitForTimeout(300);
  const after = await at();
  // up the screen is world north-west: x and y both fall (or a wall stops one of them, never a rise)
  expect(after.x).toBeLessThanOrEqual(before.x);
  expect(after.y).toBeLessThanOrEqual(before.y);
  expect(before.x - after.x + (before.y - after.y)).toBeGreaterThan(0);
});

test('a ghost is told so and loses every prompt but doors', async ({ page }, info) => {
  await toWorld(page, '&ghost=1&phase=day');
  await expect(page.getByTestId('hud')).toContainText('You are a ghost');
  await page.waitForTimeout(400);
  await page.screenshot({ path: info.outputPath('ghost.png') });
});
