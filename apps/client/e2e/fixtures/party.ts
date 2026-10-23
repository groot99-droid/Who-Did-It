import { expect, type Page } from '@playwright/test';

// The one place the specs create and join a party (round 7, ui-reskin.md 2): the menu's Start Game and Join Game
// buttons, the dialogs they open and the labels inside them. A visible label that changes changes here, never an
// `aria-label` that lies. The landing is the page the caller has already opened (`goto`).

/**
 * The opening cinematic (6Q) covers the menu once per session unless the caller opted out (`?intro=0`, a
 * `wdi:introSeen` init script, the mock): Esc skips it, then the menu is there.
 */
async function reachMenu(page: Page): Promise<void> {
  const menu = page.getByTestId('menu');
  const intro = page.getByTestId('intro');
  await menu.or(intro).first().waitFor();
  if (await intro.isVisible()) await page.keyboard.press('Escape');
  await expect(menu).toBeVisible();
}

/** Start Game, ask the name, keep the default Open party, Create Party. Resolves once the click is made. */
export async function createParty(page: Page, name: string): Promise<void> {
  await reachMenu(page);
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create Party' }).click();
}

/**
 * Join by code with a name. Works from the menu and from a `#/join/CODE` link (whose code box is already open);
 * the code box is where a code is typed.
 */
export async function joinParty(page: Page, code: string, name: string): Promise<void> {
  await reachMenu(page);
  const box = page.getByLabel('Party code');
  if (!(await box.isVisible())) await page.getByRole('button', { name: 'Join Game' }).click();
  await box.fill(code);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join Party' }).click();
}

/**
 * After Ready: waits for the overworld, then skips the map's opening cutscene (round 6, 6J) when its Skip shows, so
 * the HUD is up. A match that starts without an opening (a quick match, the mock) has no Skip and costs the wait.
 */
export async function enterWorld(page: Page): Promise<void> {
  await expect(page.getByTestId('entered')).toContainText('overworld');
  // The map opening (117 s on HollowMere) hides the HUD until it ends: wait for whichever comes first, its Skip or
  // the HUD clock, rather than a fixed window that a slower second page can miss.
  const skip = page.getByTestId('cutscene-skip');
  const clock = page.getByTestId('hud-clock');
  await expect
    .poll(async () => (await skip.isVisible()) || (await clock.isVisible()), { timeout: 30_000 })
    .toBe(true);
  if (await skip.isVisible()) await skip.click();
}
