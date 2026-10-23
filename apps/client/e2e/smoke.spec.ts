import { expect, test } from '@playwright/test';
import { createParty, joinParty } from './fixtures/party';

// Runs against the `?mock=1` fixture, so no server is needed. Each browser context is an
// isolated world: the joiner types the creator's code, and the mock accepts any well-formed one.

test('two players create and join a party and both reach the lobby', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  await host.goto('/Who-Did-It/?mock=1');
  await createParty(host, 'Hana');
  const code = (await host.getByTestId('party-code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z0-9]{5}$/);
  await expect(host.getByTestId('player-list')).toContainText('Hana');

  await guest.goto('/Who-Did-It/?mock=1');
  await joinParty(guest, code.toLowerCase(), 'Gus');
  await expect(guest.getByTestId('party-code')).toHaveText(code);
  await expect(guest.getByTestId('player-list')).toContainText('Gus');

  // Leader-only Start with a confirm dialog.
  await expect(guest.getByTestId('start')).toBeHidden();
  const start = host.getByTestId('start');
  await expect(host.getByTestId('player-count')).toHaveText('4 / 10', { timeout: 5000 });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(host.getByRole('dialog')).toContainText('Start with 4 players?');
  await host.getByTestId('confirm-start').click();

  // Role card: private, flips, Ready dismisses it, Tab brings it back.
  await expect(host.getByTestId('role-name')).toHaveText('Killer');
  await host.getByTestId('ready').click();
  await expect(host.getByTestId('entered')).toContainText('overworld');
  await expect(host.getByTestId('rolecard')).toBeHidden();
  await host.keyboard.press('Tab');
  await expect(host.getByTestId('rolecard')).toBeVisible();

  await hostCtx.close();
  await guestCtx.close();
});

test('deep link prefills the code and a missing party shows the generic error', async ({ page }) => {
  await page.goto('/Who-Did-It/?mock=1#/join/ZZZZZ');
  await expect(page.getByLabel('Party code')).toHaveValue('ZZZZZ');
  await joinParty(page, 'ZZZZZ', 'Ida');
  await expect(page.getByRole('alert')).toHaveText('party not found or unavailable');
});

test('name must be 2 to 16 characters', async ({ page }) => {
  await page.goto('/Who-Did-It/?mock=1');
  await createParty(page, 'A');
  await expect(page.getByRole('alert')).toContainText('2 to 16');
});

test('the menu shows the build from /health', async ({ page }) => {
  await page.route('**/health', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ ok: true, build: 'dev' }),
    }),
  );
  await page.goto('/Who-Did-It/?intro=0');
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('menu-build')).toHaveText('vdev');
  await expect(page.locator('canvas')).toBeVisible();
});

test('Quit asks, says goodbye and goes back to the menu; a profile and a friend survive a reload', async ({
  page,
}) => {
  await page.goto('/Who-Did-It/?mock=1&intro=0');
  await page.getByRole('button', { name: 'Quit' }).click();
  await page.getByTestId('quit-confirm').click();
  await expect(page.getByTestId('quit-bye')).toBeVisible();
  await page.getByTestId('quit-back').click();
  await expect(page.getByTestId('menu')).toBeVisible();

  await page.getByTestId('menu-chip').click();
  await page.getByLabel('Your name').fill('Mira');
  const code = (await page.getByTestId('profile-code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z2-9]{8}$/);
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByTestId('menu-chip')).toContainText('Mira');

  await page.getByRole('button', { name: 'Friends' }).click();
  await page.getByLabel('Friend code or link').fill('https://x.example/#/friend/ABCD2345');
  await page.getByRole('button', { name: 'Add friend' }).click();
  await expect(page.getByTestId('friends-list')).toContainText('ABCD2345');

  await page.reload();
  await expect(page.getByTestId('menu-chip')).toContainText('Mira');
});
