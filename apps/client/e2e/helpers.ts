import { expect, type BrowserContext, type Page } from '@playwright/test';

/** The start-screen intro video (6Q) plays once per session outside the mock: mark it seen before the first goto. */
export async function skipIntro(target: Page | BrowserContext): Promise<void> {
  await target.addInitScript("sessionStorage.setItem('wdi:introSeen', '1')");
}

/**
 * The opening cutscene (6C) plays when the first world phase starts and hides the HUD: skip it with Esc. Every caller
 * goes on to the world, so this waits for the HUD clock rather than giving the cutscene a fixed window to appear in: on
 * a loaded runner it can start after any such window, and a late cutscene that nobody skipped kept the HUD hidden.
 */
export async function skipOpening(page: Page): Promise<void> {
  const cutscene = page.getByTestId('cutscene');
  const clock = page.getByTestId('hud-clock');
  await expect(async () => {
    if (await cutscene.isVisible()) await page.keyboard.press('Escape');
    await expect(cutscene).toHaveCount(0, { timeout: 1_000 });
    await expect(clock).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 45_000 });
}
