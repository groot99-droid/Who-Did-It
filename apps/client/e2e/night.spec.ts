import { expect, test, type Page } from '@playwright/test';

// The ONUB v2 night, dawn and Morning Rush against the `?mock=1&mode=onub` feed (no server). The mock's
// clock runs `speed` times faster. Frozen hooks only (onub-contract.md 7); no text is asserted on an ONUB hook.

async function toNight(page: Page, role = 'chef') {
  await page.goto(`/Who-Did-It/?mock=1&mode=onub&speed=8&role=${role}`);
  await page.getByLabel('Your name').fill('Hana');
  await page.getByRole('button', { name: 'Create Party' }).click();
  await expect(page.getByTestId('player-list')).toContainText('Hana');
  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await page.getByTestId('ready').click();
}

test('a sleeper sees lights-out and the narrator, a waker the card table, then dawn and the Rush', async ({
  page,
}, info) => {
  await toNight(page);

  await expect(page.getByTestId('night')).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId('narrator')).toBeVisible();
  await expect(page.getByTestId('lights-out')).toBeVisible();
  await expect(page.getByTestId('night-wake')).toBeHidden();

  // The Chef de Cuisine's window opens.
  await expect(page.getByTestId('night-wake')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('lights-out')).toBeHidden();
  await expect(page.getByTestId('card-table')).toBeVisible();
  await expect(page.locator('[data-testid^="slot-"]')).toHaveCount(2 * 5 + 3 + 3);
  await expect(page.getByTestId('act-onub.peekRole')).toBeVisible();
  await expect(page.getByTestId('act-onub.peekPantry')).toBeVisible();
  await expect(page.getByTestId('act-confirm')).toBeDisabled();
  await page.screenshot({ path: info.outputPath('night-wake.png') });

  await page.getByTestId('act-onub.peekRole').click();
  await page.getByTestId('slot-seat.1.role').click();
  await expect(page.getByTestId('act-confirm')).toBeEnabled();
  await page.getByTestId('act-confirm').click();
  await expect(page.getByTestId('night-done')).toBeVisible();
  await expect(page.getByTestId('night-reveal')).toBeVisible();
  await expect(page.getByTestId('night-reveal-entry')).toHaveCount(1);

  // Back to the dark when the window ends, then dawn.
  await expect(page.getByTestId('night-wake')).toBeHidden({ timeout: 30_000 });
  await expect(page.getByTestId('lights-out')).toBeVisible();
  await expect(page.getByTestId('dawn')).toBeVisible({ timeout: 60_000 });

  // The Morning Rush.
  await expect(page.getByTestId('meeting')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('rush-board')).toBeVisible();
  await expect(page.getByTestId('vote-pantry')).toBeVisible();
  await expect(page.getByTestId('vote-skip')).toBeHidden();
  await expect(page.getByTestId('portrait-mock-me')).toBeDisabled();
  await expect(page.getByTestId('portrait-mock-bo')).toBeEnabled();

  await page.getByTestId('claim-open').click();
  await expect(page.getByTestId('claim-role-chef')).toBeVisible();
  await expect(page.getByTestId('claim-role-tourrier')).toHaveCount(0);
  await expect(page.getByTestId('claim-station-oven')).toBeVisible();
  await expect(page.getByTestId('claim-post')).toBeDisabled();
  await page.getByTestId('claim-role-chef').click();
  await page.getByTestId('claim-station-oven').click();
  await expect(page.getByTestId('claim-card-oakFirewood')).toBeVisible();
  await page.getByTestId('claim-saw-add').click();
  await page.getByTestId('claim-saw-add').click();
  await expect(page.getByTestId('claim-saw-add')).toBeHidden();
  await expect(page.getByTestId('claim-post')).toBeEnabled();
  await page.getByTestId('claim-post').click();
  await expect(page.getByTestId('claimed-mock-me')).toBeVisible();
  await page.screenshot({ path: info.outputPath('rush.png') });
});
