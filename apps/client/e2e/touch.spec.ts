import { expect, test } from '@playwright/test';
import { createParty } from './fixtures/party';

// Round 10, 10Y (A334; UI.md 14.52; rolecards.md 1.2 A3): on a phone the card's abilities each get a disc, Q, R and
// F, labelled with the ability's name, in a row over the Use, Run, Sneak and Strike cluster. The mock deals the
// Killer: Kill (Q) and Lock door (R); Drag body is a hold and gets no disc. The screenshot is UI.md 12's
// `touch-390w.png`.

test('the ability discs on a phone', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/Who-Did-It/?mock=1&touch=1');
  await createParty(page, 'Hana');
  await expect(page.getByTestId('player-list')).toContainText('Hana');
  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await page.getByTestId('ready').click();
  await expect(page.getByTestId('hud-clock')).toBeVisible();

  const q = page.getByTestId('touch-ability-Q');
  const r = page.getByTestId('touch-ability-R');
  await expect(q).toHaveText('QKill');
  await expect(r).toHaveText('RLock door');
  await expect(page.getByTestId('touch-ability-F')).toHaveCount(0);
  await expect(page.getByTestId('touch-act')).toHaveCount(0);
  // Every disc sits inside the phone's viewport, the row above the cluster and clear of the stick.
  const stick = await page.locator('.wdi-stick').boundingBox();
  const use = await page.getByTestId('touch-use').boundingBox();
  for (const disc of [q, r, page.getByTestId('touch-use'), page.getByTestId('touch-strike')]) {
    const box = await disc.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
    expect(box!.x).toBeGreaterThanOrEqual(stick!.x + stick!.width);
  }
  const rBox = await r.boundingBox();
  expect(rBox!.y + rBox!.height).toBeLessThanOrEqual(use!.y);
  await page.screenshot({ path: info.outputPath('touch-390w.png') });
});
