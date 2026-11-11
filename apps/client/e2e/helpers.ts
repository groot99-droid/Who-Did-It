import { expect, type BrowserContext, type Page } from '@playwright/test';

/** The start-screen intro video (6Q) plays once per session outside the mock: mark it seen before the first goto. */
export async function skipIntro(target: Page | BrowserContext): Promise<void> {
  await target.addInitScript("sessionStorage.setItem('wdi:introSeen', '1')");
}

/** The opening cutscene (6C) plays when the first world phase starts and hides the HUD: skip it with Esc. */
export async function skipOpening(page: Page): Promise<void> {
  const cutscene = page.getByTestId('cutscene');
  // World.create mounts the HUD and starts the pending opening in the same call, so once the HUD is in the page the
  // opening is too. Waiting a fixed 10 s for the cutscene alone raced a slow runner: the World came up later, the
  // opening then played over the HUD and the next `hud-clock` check failed.
  await page.getByTestId('hud').waitFor({ state: 'attached', timeout: 60_000 });
  await cutscene.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => undefined);
  if ((await cutscene.count()) > 0) await page.keyboard.press('Escape');
  await expect(cutscene).toHaveCount(0);
}
