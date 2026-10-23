import { expect, type Page } from '@playwright/test';

/** The opening cutscene (6C) plays when the first world phase starts and hides the HUD: skip it with Esc. */
export async function skipOpening(page: Page): Promise<void> {
  const cutscene = page.getByTestId('cutscene');
  await cutscene.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
  if ((await cutscene.count()) > 0) await page.keyboard.press('Escape');
  await expect(cutscene).toHaveCount(0);
}
