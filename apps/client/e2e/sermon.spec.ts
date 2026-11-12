import { expect, test } from '@playwright/test';
import { balance } from '@wdi/content';
import { createParty } from './fixtures/party';

// Story I9b (GDD 3.23; UI.md 14.57): the Vicar's sermon at the bell, on the mock (`?vicar=bell` plays the Vicar's look
// one tile below the bell by day; the sermon runs `conversion.sermonS`, two listeners hear it and are converted).

async function toBell(page: import('@playwright/test').Page) {
  await page.goto('/Who-Did-It/?mock=1&vicar=bell&phase=day&bots=still');
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
  test(`the Vicar preaches at the bell and counts the converted (${width}x${height})`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000 + balance.conversion.sermonS * 1000);
    await page.setViewportSize({ width, height });
    await toBell(page);
    await expect(page.getByTestId('sermon-prompt')).toBeVisible();
    await expect(page.getByTestId('sermon-prompt')).toContainText('preach a sermon');
    await expect(page.getByTestId('converted-count')).toBeHidden();
    await page.screenshot({ path: info.outputPath(`sermon-prompt-${width}.png`) });

    await page.getByTestId('sermon-prompt').dispatchEvent('pointerdown');
    await expect(page.getByTestId('sermon-banner')).toContainText('Preaching:');
    await expect(page.getByTestId('sermon-prompt')).toBeHidden();
    await page.screenshot({ path: info.outputPath(`sermon-preaching-${width}.png`) });
    await expect(page.getByTestId('hud')).toContainText('Your sermon reached 2 souls', {
      timeout: (balance.conversion.sermonS + 10) * 1000,
    });
    await expect(page.getByTestId('converted-count')).toContainText('Converted: 2');
    await expect(page.getByTestId('sermon-banner')).toBeHidden();
    await expect(page.getByTestId('sermon-prompt')).toBeHidden(); // once a day
    await page.screenshot({ path: info.outputPath(`sermon-done-${width}.png`) });
  });
}
