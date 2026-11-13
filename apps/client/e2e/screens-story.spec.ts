import { expect, test, type Locator } from '@playwright/test';

// Story mode (docs/story/README.md 3, UI.md "Story cards"): the title screen's Story entry, the chapter cards and the
// goals strip on a phone and on a desktop, against the mock server path (`?mock=1`), which plays a fixed three-chapter
// fixture story. Every screen must sit inside the viewport with nothing cut off sideways.

async function fits(el: Locator, width: number, height: number) {
  const box = await el.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-0.5);
  expect(box!.y).toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);
  expect(box!.y + box!.height).toBeLessThanOrEqual(height + 0.5);
  const wide = await el.evaluate((root) =>
    [root, ...root.querySelectorAll<HTMLElement>('*')]
      .filter((e) => e.getClientRects().length > 0 && e.scrollWidth > e.clientWidth + 1)
      .filter((e) => !/auto|scroll/.test(getComputedStyle(e).overflowX))
      .map((e) => `${e.tagName.toLowerCase()}.${e.className}`)
      .slice(0, 5),
  );
  expect(wide, 'nothing in the screen is cut off sideways').toEqual([]);
}

for (const [name, width, height, query] of [
  ['390w', 390, 844, '&touch=1'],
  ['1280x720', 1280, 720, ''],
] as const) {
  test.describe(`story cards at ${name}`, () => {
    test.beforeEach(async ({ page }) => page.setViewportSize({ width, height }));

    test('the Story entry opens the chapter list, and the cards play through the three chapters', async ({
      page,
    }, info) => {
      await page.goto(`/Who-Did-It/?mock=1${query}`);
      await page.getByTestId('menu-story').click();
      const chapters = page.getByTestId('story-chapter');
      await expect(chapters).toHaveCount(3);
      await expect(chapters.nth(0)).toHaveAttribute('data-state', 'next');
      await expect(chapters.nth(1)).toHaveAttribute('data-state', 'locked');
      await page.screenshot({ path: info.outputPath(`story-menu-${name}.png`), animations: 'disabled' });
      await page.getByLabel('Your name').fill('Hana');
      await page.getByTestId('story-begin').click();

      const card = page.getByTestId('story-card');
      await expect(card).toHaveAttribute('data-kind', 'title');
      await expect(page.getByTestId('story-title')).toHaveText('First chapter');
      await fits(card.locator('.wdi-story__panel'), width, height);
      await page.screenshot({ path: info.outputPath(`story-title-${name}.png`), animations: 'disabled' });

      await page.getByTestId('story-continue').click();
      await expect(card).toHaveAttribute('data-kind', 'beat');
      await expect(page.getByTestId('story-goal')).toContainText('Do the first thing');
      await fits(card.locator('.wdi-story__panel'), width, height);
      await page.screenshot({ path: info.outputPath(`story-beat-${name}.png`), animations: 'disabled' });

      // The beat closes onto the goals strip first, then the chapter's end card (the mock sends both in one go).
      await page.getByTestId('story-continue').click();
      await expect(card).toHaveAttribute('data-kind', 'end');
      await expect(page.getByTestId('story-summary')).toContainText('Loaves baked');
      await expect(page.getByTestId('story-next')).toContainText('Second chapter');
      await fits(card.locator('.wdi-story__panel'), width, height);
      await page.screenshot({ path: info.outputPath(`story-end-${name}.png`), animations: 'disabled' });

      await page.getByTestId('story-continue').click();
      await expect(card).toHaveAttribute('data-chapter', 'mock2');

      // Part 2: a section card after the chapter's title card, then a scripted NPC's lines.
      await page.getByTestId('story-continue').click();
      await expect(card).toHaveAttribute('data-kind', 'section');
      await expect(card).toHaveAttribute('data-section', 'mock2_b');
      await fits(card.locator('.wdi-story__panel'), width, height);
      await page.screenshot({ path: info.outputPath(`story-section-${name}.png`), animations: 'disabled' });
      await page.getByTestId('story-continue').click();
      await expect(card).toHaveAttribute('data-kind', 'line');
      await expect(page.getByTestId('story-speaker')).toHaveText('Old Marta');
      await expect(page.getByTestId('story-line')).toHaveCount(2);
      await fits(card.locator('.wdi-story__panel'), width, height);
      await page.screenshot({ path: info.outputPath(`story-line-${name}.png`), animations: 'disabled' });
    });

    test('the last end card is followed by the end screen with every chapter and what was earned', async ({
      page,
    }, info) => {
      await page.goto(`/Who-Did-It/?mock=1${query}`);
      await page.evaluate(() =>
        localStorage.setItem('wdi:achv', JSON.stringify({ bakerDone: '2026-11-07' })),
      );
      await page.getByTestId('menu-story').click();
      await page.getByLabel('Your name').fill('Hana');
      await page.getByTestId('story-begin').click();
      const card = page.getByTestId('story-card');
      for (let i = 0; i < 12 && !(await page.getByTestId('story-finale').count()); i++) {
        if (
          (await card.count()) &&
          (await card.getAttribute('data-chapter')) === 'mock3' &&
          (await card.getAttribute('data-kind')) === 'end'
        ) {
          await expect(page.getByTestId('story-next')).toHaveCount(0);
        }
        if (await card.count()) await page.getByTestId('story-continue').click();
        else await page.waitForTimeout(100);
      }
      const finale = page.getByTestId('story-finale');
      await expect(finale).toBeVisible();
      await expect(page.getByTestId('finale-chapter')).toHaveCount(3);
      await expect(page.getByTestId('finale-earned')).toContainText('Flour on the Hands');
      await fits(finale.locator('.wdi-story__panel'), width, height);
      await page.screenshot({ path: info.outputPath(`story-finale-${name}.png`), animations: 'disabled' });
      await page.getByTestId('story-end-close').click();
      await expect(finale).toHaveCount(0);
    });
  });
}

// Save and resume (docs/accounts/plan.md 5): the server's `story.saved` at a chapter break lands in the device store,
// and the Story menu offers Continue from the chapter it names. The mock plays the server's part.
for (const [name, width, height, query] of [
  ['390w', 390, 844, '&touch=1'],
  ['1280x720', 1280, 720, ''],
] as const) {
  test(`a chapter break saves, and the Story menu continues from it at ${name}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/Who-Did-It/?mock=1${query}`);
    await page.getByTestId('menu-story').click();
    await expect(page.getByTestId('story-resume')).toHaveCount(0);
    await page.getByLabel('Your name').fill('Hana');
    await page.getByTestId('story-begin').click();
    await page.getByTestId('story-continue').click(); // title -> beat
    await page.getByTestId('story-continue').click(); // beat -> chapter 1's end card (saved)
    await expect(page.getByTestId('story-card')).toHaveAttribute('data-kind', 'end');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('wdi:story:save')))
      .toContain('"nextChapterId":"mock2"');

    await page.goto(`/Who-Did-It/?mock=1${query}`); // a new visit: only the device store remembers
    await page.getByTestId('menu-story').click();
    const resume = page.getByTestId('story-resume');
    await expect(resume).toHaveAttribute('data-chapter', 'mock2');
    await expect(resume).toContainText('Chapter 2');
    await page.screenshot({ path: info.outputPath(`story-resume-${name}.png`), animations: 'disabled' });
    await page.getByLabel('Your name').fill('Hana');
    await resume.click();
    await expect(page.getByTestId('story-card')).toHaveAttribute('data-chapter', 'mock2');
    await expect(page.getByTestId('story-title')).toHaveText('Second chapter');
  });
}
