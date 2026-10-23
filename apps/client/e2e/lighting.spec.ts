import { expect, test, type Page } from '@playwright/test';
import { createParty } from './fixtures/party';

// The darkness layer (SPRITES 10.11) covers the whole canvas, also after the window changes size. Before the fix it
// kept the centre of its first size and left a strip uncovered on the left and top, which read as a shadow's edge.

async function toWorld(page: Page): Promise<void> {
  await page.goto('/Who-Did-It/?mock=1');
  await createParty(page, 'Hana');
  await expect(page.getByTestId('player-list')).toContainText('Hana');
  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await page.getByTestId('ready').click();
  await expect(page.getByTestId('hud-clock')).toBeVisible();
}

/** The darkness image's size and origin against the World camera's, in canvas pixels. */
function layer(page: Page) {
  return page.evaluate(() => {
    type Img = {
      texture: { key: string };
      width: number;
      height: number;
      displayOriginX: number;
      displayOriginY: number;
    };
    const game = (window as unknown as { __wdiGame: { scene: { getScene(k: string): unknown } } }).__wdiGame;
    const world = game.scene.getScene('World') as {
      cameras: { main: { width: number; height: number } };
      children: { list: Img[] };
    };
    const img = world.children.list.find((o) => o.texture?.key === 'gen_dark');
    if (!img) return null;
    const cam = world.cameras.main;
    return {
      w: img.width,
      h: img.height,
      ox: img.displayOriginX,
      oy: img.displayOriginY,
      cw: cam.width,
      ch: cam.height,
    };
  });
}

function expectCovers(l: Awaited<ReturnType<typeof layer>>): void {
  expect(l).not.toBeNull();
  const v = l!;
  // DynamicTexture rounds a size up to an even number.
  expect(v.w).toBeGreaterThanOrEqual(v.cw);
  expect(v.w - v.cw).toBeLessThanOrEqual(1);
  expect(v.h).toBeGreaterThanOrEqual(v.ch);
  expect(v.h - v.ch).toBeLessThanOrEqual(1);
  expect(v.ox).toBeCloseTo(v.w / 2, 3);
  expect(v.oy).toBeCloseTo(v.h / 2, 3);
}

test('the darkness layer covers the canvas at start and after a resize', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 650 });
  await toWorld(page);
  expectCovers(await layer(page));
  await page.setViewportSize({ width: 1470, height: 830 });
  await expect.poll(async () => (await layer(page))?.cw).toBe(1470);
  expectCovers(await layer(page));
});
