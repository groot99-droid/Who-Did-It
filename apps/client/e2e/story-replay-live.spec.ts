import { expect, test } from '@playwright/test';

// Replaying a finished chapter against the real server (docs/story/README.md Q-S4; Story.ts `replayFrom`). A guest's
// save lives on the device, so the menu's Replay must send it back with `story.start { chapterId, resume }`: without
// it the server has no save to replay from and starts chapter 1.
test('Replay on a finished chapter starts that chapter, not the first', async ({ page }) => {
  test.setTimeout(120_000);
  const save = {
    v: 1,
    storyId: 'hollowmere_winter',
    nextChapterId: 'act4_works',
    finished: ['act1_line', 'act2_score'],
    handOn: [],
    replayUsed: [],
    summaries: [],
    rev: 2,
    savedAt: 1,
  };
  await page.addInitScript((s) => {
    localStorage.setItem('wdi:introSeen', '1');
    localStorage.setItem('wdi:story:save', JSON.stringify({ hollowmere_winter: s }));
    localStorage.setItem('wdi:story:finished', JSON.stringify(['act1_line', 'act2_score']));
  }, save);
  await page.goto('/Who-Did-It/');
  const menu = page.getByTestId('menu');
  const intro = page.getByTestId('intro');
  await menu.or(intro).first().waitFor();
  if (await intro.isVisible()) await page.keyboard.press('Escape');
  await page.getByTestId('menu-story').click();
  await page.getByLabel('Your name').fill('Hana');
  await page.locator('[data-testid="story-replay"][data-chapter="act2_score"]').click();
  const card = page.getByTestId('story-card');
  await expect(card).toHaveAttribute('data-kind', 'title', { timeout: 30_000 });
  await expect(card).toHaveAttribute('data-chapter', 'act2_score');
});
