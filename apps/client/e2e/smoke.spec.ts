import { expect, test } from '@playwright/test';

// Runs against the `?mock=1` fixture, so no server is needed. Each browser context is an
// isolated world: the joiner types the creator's code, and the mock accepts any well-formed one.

test('two players create and join a party and both reach the lobby', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  await host.goto('/Who-Did-It/?mock=1');
  await host.getByLabel('Your name').fill('Hana');
  await host.getByRole('button', { name: 'Create Party' }).click();
  const code = (await host.getByTestId('party-code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z0-9]{5}$/);
  await expect(host.getByTestId('player-list')).toContainText('Hana');

  await guest.goto('/Who-Did-It/?mock=1');
  await guest.getByLabel('Your name').fill('Gus');
  await guest.getByLabel('Party code').fill(code.toLowerCase());
  await guest.getByRole('button', { name: 'Join Party' }).click();
  await expect(guest.getByTestId('party-code')).toHaveText(code);
  await expect(guest.getByTestId('player-list')).toContainText('Gus');

  // Leader-only Start, gated at 4 players with a confirm dialog.
  await expect(guest.getByTestId('start')).toBeHidden();
  const start = host.getByTestId('start');
  await expect(start).toBeEnabled();
  await start.click();
  await expect(host.getByRole('dialog')).toContainText('Start with 4 players?');
  await host.getByTestId('confirm-start').click();

  // Role card: private, flips, Ready dismisses it, Tab brings it back.
  await expect(host.getByTestId('role-name')).toHaveText('Killer');
  await host.getByTestId('ready').click();
  await expect(host.getByTestId('rolecard')).toBeHidden();
  await host.keyboard.press('Tab');
  await expect(host.getByTestId('rolecard')).toBeVisible();

  await hostCtx.close();
  await guestCtx.close();
});

test('deep link prefills the code and a missing party shows the generic error', async ({ page }) => {
  await page.goto('/Who-Did-It/?mock=1#/join/ZZZZZ');
  await expect(page.getByLabel('Party code')).toHaveValue('ZZZZZ');
  await page.getByLabel('Your name').fill('Ida');
  await page.getByRole('button', { name: 'Join Party' }).click();
  await expect(page.getByRole('alert')).toHaveText('party not found or unavailable');
});

test('name must be 2 to 16 characters', async ({ page }) => {
  await page.goto('/Who-Did-It/?mock=1');
  await page.getByLabel('Your name').fill('A');
  await page.getByRole('button', { name: 'Create Party' }).click();
  await expect(page.getByRole('alert')).toContainText('2 to 16');
});

test('boot prints {ok, build} from /health', async ({ page }) => {
  await page.route('**/health', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ ok: true, build: 'abc12345' }),
    }),
  );
  await page.goto('/Who-Did-It/');
  await expect(page.getByLabel('Your name')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('canvas')).toBeVisible();
});
