import { expect, test } from '@playwright/test';
import { createParty } from './fixtures/party';

// Story R7 (GDD 3.20; UI.md 14.56): the martyr's shade and the Medium's rite, on the mock (`?ghost=shade` dies as
// the shade with the Medium one tile away; the rite runs `rite.holdS` and the seat returns two seconds later).

async function toShade(page: import('@playwright/test').Page) {
  await page.goto('/Who-Did-It/?mock=1&ghost=shade&phase=night&bots=still');
  await createParty(page, 'Hana');
  await expect(page.getByTestId('start')).toBeEnabled();
  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await page.getByTestId('ready').click();
  await expect(page.getByTestId('hud-clock')).toBeVisible();
}

for (const [width, height] of [
  [390, 844],
  [1280, 720],
] as const) {
  test(`the shade takes the rite at the Medium and comes back (${width}x${height})`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    await toShade(page);
    await expect(page.getByTestId('hud')).toContainText('You are a shade');
    await expect(page.getByTestId('hud')).not.toContainText('You are a ghost');
    await expect(page.getByTestId('rite-banner')).toContainText('Find the Medium in The Fenwood');
    await expect(page.getByTestId('rite-prompt')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`rite-open-${width}.png`) });

    await page.getByTestId('rite-prompt').dispatchEvent('pointerdown');
    await expect(page.getByTestId('rite-banner')).toContainText('The rite:');
    await expect(page.getByTestId('rite-prompt')).toBeHidden();
    await page.screenshot({ path: info.outputPath(`rite-begun-${width}.png`) });
    await expect(page.getByTestId('hud')).toContainText('The rite is done', { timeout: 20_000 });
    await expect(page.getByTestId('hud')).toContainText('You are back, stronger until dusk', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('rite-banner')).toBeHidden();
  });
}
