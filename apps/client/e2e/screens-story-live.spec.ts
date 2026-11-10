import { expect, test } from '@playwright/test';

// Story mode against the real server (docs/story/README.md): the title screen's Story entry creates the room, the server
// answers `story.start` with the first chapter's title card, and a tap on Begin closes it into the world. The server
// runs from source with the rest of the e2e suite (playwright.config.ts).
for (const [name, width, height, query] of [
  ['390w', 390, 844, '?touch=1'],
  ['1280x720', 1280, 720, ''],
] as const) {
  test(`Story on the title screen starts the real story and plays the first card at ${name}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    test.setTimeout(120_000);
    await page.addInitScript(() => localStorage.setItem('wdi:introSeen', '1'));
    await page.goto(`/Who-Did-It/${query}`);
    const menu = page.getByTestId('menu');
    const intro = page.getByTestId('intro');
    await menu.or(intro).first().waitFor();
    if (await intro.isVisible()) await page.keyboard.press('Escape');
    await page.getByTestId('menu-story').click();
    await expect(page.getByTestId('story-chapter')).not.toHaveCount(0);
    await page.getByLabel('Your name').fill('Hana');
    await page.getByTestId('story-begin').click();
    const card = page.getByTestId('story-card');
    await expect(card).toHaveAttribute('data-kind', 'title', { timeout: 30_000 });
    await expect(page.getByTestId('story-title')).not.toBeEmpty();
    // The title card, then the chapter's opening beats, each closed by its own `story.continue`.
    for (let i = 0; i < 6 && (await card.count()) > 0; i++) {
      await page.getByTestId('story-continue').click();
      await page.waitForTimeout(500);
    }
    // The role card is not drawn in a story room, and the world takes over from the title screen.
    // The map's opening cutscene plays first (skipped here); the HUD and the goals strip follow it.
    await page.getByTestId('cutscene-skip').click({ timeout: 60_000 });
    await expect(page.getByTestId('hud-clock')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('menu')).toBeHidden();
    const goals = page.getByTestId('story-goals');
    await expect(goals).toBeVisible();
    const box = (await goals.boundingBox())!;
    expect(box.x).toBeLessThan(40); // pinned top-left, not in the middle of the world
    expect(box.y).toBeLessThan(130);
    await page.screenshot({ path: info.outputPath(`story-live-goals-${name}.png`) });
  });
}
