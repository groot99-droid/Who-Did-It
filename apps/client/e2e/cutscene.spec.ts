import { expect, test, type Page } from '@playwright/test';
import { createParty } from './fixtures/party';

// The cutscene player against the ?mock=1 world feed. `?cutscene=1` makes the mock Start send the HollowMere opening
// (the default mock does not, so the other specs reach the HUD at once).

async function start(page: Page, query: string): Promise<void> {
  await page.goto(`/Who-Did-It/?mock=1${query}`);
  await createParty(page, 'Hana');
  await expect(page.getByTestId('player-list')).toContainText('Hana');
  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await page.getByTestId('ready').click();
}

test('the opening shows its first caption and keeps the HUD back', async ({ page }, info) => {
  await start(page, '&cutscene=1');
  await expect(page.getByTestId('cutscene-caption')).toContainText('HOLLOWMERE');
  await expect(page.getByTestId('hud-clock')).toBeHidden();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: info.outputPath('opening.png') });
  await expect(page.getByTestId('cutscene-caption')).toContainText("Seven days' walk", { timeout: 8000 });
});

test('Skip ends the opening and gives the HUD back', async ({ page }) => {
  await start(page, '&cutscene=1');
  await page.getByTestId('cutscene-skip').click();
  await expect(page.getByTestId('cutscene')).toHaveCount(0);
  await expect(page.getByTestId('hud-clock')).toBeVisible();
});

test('Esc skips too', async ({ page }) => {
  await start(page, '&cutscene=1');
  await expect(page.getByTestId('cutscene')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cutscene')).toHaveCount(0);
  await expect(page.getByTestId('hud-clock')).toBeVisible();
});

test('a kill plays its death cutscene, then hands over to the ghost', async ({ page }) => {
  await start(page, '&cutscene=1&ghost=1');
  // The kill lands while the opening plays: the opening ends and the death cutscene takes its place.
  await expect(page.getByTestId('cutscene-caption')).toContainText('A cold edge', { timeout: 8000 });
  await expect(page.getByTestId('cutscene')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByTestId('hud')).toContainText('You are a ghost');
});

test('a death cutscene can be skipped, and the ghost handoff follows at once', async ({ page }) => {
  await start(page, '&cutscene=1&ghost=1');
  await expect(page.getByTestId('cutscene-caption')).toContainText('A cold edge', { timeout: 8000 });
  await page.getByTestId('cutscene-skip').click();
  await expect(page.getByTestId('hud')).toContainText('You are a ghost');
});
