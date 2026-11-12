import { expect, test, type Page } from '@playwright/test';
import { createParty } from './fixtures/party';

// Round 6 (6I) on the ?mock=1 world feed: `?m5b=1` stands the own seat beside the overworld's quest giver with a
// spade and a kit of nodes at spread distances (the nearest-node prompt walks them in order); E gathers. The run gathers, crafts a lantern, takes the giver's quest and
// turns it in; a second test opens each mini-game board through the `?minigame=` hook.

async function toWorld(page: Page, query: string) {
  await page.goto(`/Who-Did-It/?mock=1${query}`);
  await createParty(page, 'Hana');
  await expect(page.getByTestId('player-list')).toContainText('Hana');
  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await page.getByTestId('ready').click();
  await expect(page.getByTestId('hud-clock')).toBeVisible();
}

/** Opens the pockets panel when it is shut (the key button toggles). */
async function pockets(page: Page) {
  if (!(await page.getByTestId('inventory').isVisible())) await page.getByTestId('m5b-inv').click();
}

/**
 * Holds E (the layer takes it for the nearest node) until the pockets hold `qty` of `item`: a cell shows its count
 * above one only (A13b's grid, #335), so one of a thing is the cell alone. The kit's nodes sit at spread distances, so
 * the nearest one is next in the order the run needs them.
 */
async function gather(page: Page, item: string, qty: number) {
  await pockets(page);
  const cell = page.getByTestId(`inventory-item-${item}`);
  await expect(async () => {
    await page.keyboard.down('KeyE');
    try {
      if (qty > 1) await expect(cell).toContainText(`x${qty}`, { timeout: 9000 });
      else await expect(cell).toBeVisible({ timeout: 9000 });
    } finally {
      await page.keyboard.up('KeyE');
    }
  }).toPass({ timeout: 40_000 });
}

test('gathers, crafts a lantern and turns in a quest', async ({ page }) => {
  await toWorld(page, '&m5b=1');
  await expect(page.getByTestId('m5b')).toBeVisible();
  // The layer spans the viewport above the HUD and the canvas; it must not paint the theme background over the world.
  await expect(page.getByTestId('m5b')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  // Pockets: a spade to begin with.
  await page.getByTestId('m5b-inv').click();
  await expect(page.getByTestId('inventory-item-spade')).toBeVisible();
  await page.getByTestId('inventory-close').click();

  // Quest: take it at the giver.
  await page.getByTestId('m5b-quests').click();
  await page.getByTestId('quest-accept-caulkTheSkiff').click();
  await expect(page.getByTestId('quest-caulkTheSkiff')).toHaveAttribute('data-state', 'taken');
  await page.getByTestId('quest-close').click();

  // Gather and craft: tin and resin make a lantern (the kit skips the station), which is then lit.
  await gather(page, 'tinOre', 1);
  await gather(page, 'resin', 1);
  await page.getByTestId('inventory-close').click();
  await page.getByTestId('m5b-craft').click();
  await page.getByTestId('craft-lantern').click();
  await page.getByTestId('crafting-close').click();
  await pockets(page);
  await expect(page.getByTestId('inventory-item-lantern')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('inventory-light').click();

  // Quest: two more resin and a timber, then the turn-in pays a lantern.
  await gather(page, 'resin', 2);
  await gather(page, 'timber', 1);
  await page.getByTestId('inventory-close').click();
  await page.getByTestId('m5b-quests').click();
  await page.getByTestId('quest-turnin-caulkTheSkiff').click();
  await expect(page.getByTestId('quest-caulkTheSkiff')).toHaveAttribute('data-state', 'done');
});

test('opens a mini-game board and judges the answer', async ({ page }) => {
  await toWorld(page, '&minigame=slide');
  await expect(page.getByTestId('minigame')).toHaveAttribute('data-kind', 'slide');
  await expect(page.getByTestId('minigame-stage')).toBeVisible();
  await page.getByTestId('minigame-cancel').click();
  await expect(page.getByTestId('minigame')).toHaveCount(0);
});

test('E falls through to the World verbs when no node, giver or counter is in reach', async ({ page }) => {
  // The square's spawn has had the Market's counter a tile away since the village was dressed (#238), and a counter
  // in reach takes E (8C): the seat starts at the forest's back, where nothing is in reach, with the bots parked.
  await toWorld(page, '&scene=overworld&spawn=forest_back&bots=still');
  await expect(page.getByTestId('m5b')).toBeVisible();
  await expect(page.getByTestId('m5b-prompt')).toBeHidden();
  await expect(page.getByTestId('shop-prompt')).toBeHidden();
  await page.keyboard.press('KeyE');
  await expect(page.getByText('Nothing to use here')).toBeVisible();
  await expect(page.getByTestId('m5b-toast')).toBeHidden();
});
