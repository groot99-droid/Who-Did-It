import { expect, test, type Page } from '@playwright/test';
import { onubBalance } from '@wdi/content';
import { createParty } from './fixtures/party';

// Evening Prep on the mock (`?mock=1&mode=onub`, no server): the kitchen, a station room, the mini-game gate,
// the hand, the single commit, the waiting panel and the crime-scene board. Hooks are onub-contract.md 7; no
// spec asserts copy. `speed=2` keeps the 20 s assist inside the 60 s of prep; `speed=8` shortens the timeout case.

async function startQuick(page: Page, search: string): Promise<void> {
  await page.goto(`/Who-Did-It/?mock=1&mode=onub&${search}`);
  await createParty(page, 'Hana');
  await expect(page.getByTestId('deck-editor')).toBeVisible();
  await expect(page.getByTestId('start')).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await page.getByTestId('ready').click();
  await expect(page.getByTestId('kitchen')).toBeVisible({ timeout: 20_000 });
}

test('lobby deck editor: one toggle per role, the leader can change it', async ({ page }) => {
  await page.goto('/Who-Did-It/?mock=1&mode=onub');
  await createParty(page, 'Hana');
  await expect(page.getByTestId('deck-editor')).toBeVisible();
  for (const id of ['boulanger', 'champignon', 'critique']) {
    await expect(page.getByTestId(`deck-role-${id}`)).toHaveCount(1);
    await expect(page.getByTestId(`deck-role-${id}`)).toBeEnabled();
  }
  await expect(page.getByTestId('deck-reset')).toBeHidden();
  await page.getByTestId('deck-role-critique').click();
  await expect(page.getByTestId('deck-problem')).toBeVisible();
  await expect(page.getByTestId('deck-reset')).toBeVisible();
  await page.getByTestId('deck-reset').click();
  await expect(page.getByTestId('deck-problem')).toBeHidden();
});

test('a Baker plays a station through to the crime-scene board', async ({ page }) => {
  await startQuick(page, 'speed=2');
  await expect(page.getByTestId('onub-clock')).toBeVisible();
  for (const s of onubBalance.stations) {
    await expect(page.getByTestId(`station-${s.id}`)).toHaveCount(1);
    await expect(page.getByTestId(`station-${s.id}`)).toBeEnabled();
  }
  await page.getByTestId('station-fridge').click();
  await expect(page.getByTestId('station-room')).toBeVisible();
  await expect(page.getByTestId('minigame-fridge')).toBeVisible();
  await expect(page.getByTestId('hand')).toBeHidden();
  await expect(page.getByTestId('station-back')).toBeVisible();
  await expect(page.getByTestId('minigame-assist')).toBeVisible({
    timeout: (onubBalance.timers.minigameAssistS + 5) * 1000,
  });
  await page.getByTestId('minigame-assist').click();
  await expect(page.getByTestId('hand')).toBeVisible();
  await expect(page.getByTestId('card-pureDairy')).toBeVisible();
  await expect(page.getByTestId('card-spoiledMilk')).toHaveCount(0);
  await expect(page.getByTestId('prep-commit')).toBeDisabled();
  await page.getByTestId('card-pureDairy').click();
  await expect(page.getByTestId('prep-commit')).toBeEnabled();
  await page.getByTestId('prep-commit').click();
  await expect(page.getByTestId('prep-done')).toBeVisible();
  for (const s of onubBalance.stations) await expect(page.getByTestId(`station-${s.id}`)).toBeDisabled();
  await expect(page.getByTestId('prep-board')).toBeVisible({ timeout: 30_000 });
  for (const s of onubBalance.stations) await expect(page.getByTestId(`pile-${s.id}`)).toHaveCount(1);
  await expect(page.getByTestId('kitchen')).toBeVisible();
});

test('a seat that never commits sees the waiting panel from the server', async ({ page }) => {
  await startQuick(page, 'speed=8&role=champignon');
  await page.getByTestId('station-oven').click();
  await expect(page.getByTestId('station-back')).toBeVisible();
  await page.getByTestId('station-back').click();
  await expect(page.getByTestId('prep-done')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('prep-board')).toBeVisible({ timeout: 30_000 });
});
