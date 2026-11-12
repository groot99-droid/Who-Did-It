import { expect, test } from '@playwright/test';
import { skipIntro } from './helpers';

// Story mode against the real server (docs/story/test-plan.md): the title screen's Story entry starts
// `hollowmere_winter` on the authoritative server, the first chapter's title card comes up from the sim, "continue"
// closes it by a queued command, and the world runs behind it. The mock path is `screens-story.spec.ts`.
//

const FIRST_CHAPTER = 'ch1_baker';

for (const [name, width, height, query] of [
  ['390x844', 390, 844, '?touch=1'],
  ['1280x720', 1280, 720, ''],
] as const) {
  test.describe(`a story on the live server at ${name}`, () => {
    test.beforeEach(async ({ page }) => {
      await skipIntro(page);
      await page.setViewportSize({ width, height });
    });

    test('Story starts the first chapter: a title card from the sim, then the world', async ({ page }) => {
      await page.goto(`/Who-Did-It/${query}`);
      await page.getByTestId('menu-story').click();
      await expect(page.getByTestId('story-chapter')).toHaveCount(4);
      await page.getByLabel('Your name').fill('Hana');
      await page.getByTestId('story-begin').click();

      const card = page.getByTestId('story-card');
      await expect(card).toHaveAttribute('data-kind', 'title', { timeout: 30_000 });
      await expect(card).toHaveAttribute('data-chapter', FIRST_CHAPTER);
      const panel = card.locator('.wdi-story__panel');
      const box = await panel.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-0.5);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height + 0.5);

      await page.getByTestId('story-continue').click();
      // The title card is gone. A beat's card may be queued behind it (cards queue), so another card can follow;
      // the contract is that "continue" closes the card that was up, not that none comes next.
      await expect(page.locator('[data-testid="story-card"][data-kind="title"]')).toHaveCount(0);
      // The world is up behind the card: the canvas draws, and the page does not scroll sideways.
      await expect(page.locator('canvas').first()).toBeVisible();
      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(sideways).toBe(false);
    });
  });
}
