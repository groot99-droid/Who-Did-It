import { expect, test, type Page } from '@playwright/test';
import { createParty } from './fixtures/party';

// Public looks and covers (GDD 3.17) end to end against the real server: the role card shows the deck and the
// look a seat walks as, a cover role gets the picker (hints first, the first one preselected, a click sends
// `role.cover`) and every other card gets none. It needs the deck deal (Session 5G's `dealMainDeck`), so it runs
// only with WDI_E2E_LOOKS=1, at integration. The server runs with WDI_DEBUG=1 (playwright.config.ts).
test.skip(process.env.WDI_E2E_LOOKS !== '1', 'needs the deck deal of Session 5G merged (WDI_E2E_LOOKS=1)');

async function startFour(page: Page): Promise<void> {
  await page.addInitScript("sessionStorage.setItem('wdi:introSeen', '1')"); // no opening cinematic (6Q)
  await page.goto('/Who-Did-It/');
  await createParty(page, 'Hana');
  await expect(page.getByTestId('party-code')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByTestId('add-npc').click();
  await page.getByRole('button', { name: /start/i }).first().click();
  const confirm = page.getByRole('button', { name: /^start$/i });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.getByTestId('rolecard')).toBeVisible();
}

test('the role card shows the deck and a look line; a cover role gets the picker, anyone else none', async ({
  page,
}) => {
  await startFour(page);
  await expect(page.getByTestId('card-deck')).toBeVisible();
  const picker = page.getByTestId('cover-picker');
  if ((await picker.count()) === 0) {
    // A non-cover card: the walk line names its look and there is nothing to pick.
    await expect(page.getByTestId('card-look')).toContainText('You walk as');
    await expect(picker).toBeHidden();
    return;
  }
  // A cover role: the hints come first, safe, the first one preselected; a click moves the pick.
  const looks = page.getByTestId('cover-look');
  await expect(looks.first()).toHaveAttribute('data-safe', 'true');
  await expect(looks.first()).toHaveAttribute('aria-pressed', 'true');
  const other = looks.nth(1);
  await other.click();
  await expect(other).toHaveAttribute('aria-pressed', 'true');
  await expect(looks.first()).toHaveAttribute('aria-pressed', 'false');
});
