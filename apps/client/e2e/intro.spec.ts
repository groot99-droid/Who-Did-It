import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// The opening cinematic (DECISIONS A98, UI.md 14.24). The real clip is 6N's and is not in the repo, so every test
// serves a 2 s generated stand-in (e2e/fixtures/) through routes; nothing here depends on `public/assets/video/`.
// The mock never plays the intro unless `?intro=1`.

const fixture = (name: string) => readFileSync(join(import.meta.dirname, 'fixtures', name));
const MANIFEST = {
  version: 1,
  entries: [{ key: 'intro', url: 'intro.webm', poster: 'intro.jpg', durationS: 2, bytes: 0 }],
};

async function serveStandIn(page: Page, opts: { missingFile?: boolean } = {}): Promise<void> {
  await page.route('**/assets/video/manifest.json', (r) => r.fulfill({ json: MANIFEST }));
  await page.route('**/assets/video/intro.jpg', (r) =>
    r.fulfill({ body: fixture('intro-standin.jpg'), contentType: 'image/jpeg' }),
  );
  await page.route('**/assets/video/intro.webm', (r) =>
    opts.missingFile
      ? r.fulfill({ status: 404, body: 'not found' })
      : r.fulfill({ body: fixture('intro-standin.webm'), contentType: 'video/webm' }),
  );
}

const landing = (page: Page) => page.getByLabel('Your name');

test('the mock e2e skips the intro unless ?intro=1', async ({ page }) => {
  await serveStandIn(page);
  await page.goto('/Who-Did-It/?mock=1');
  await expect(landing(page)).toBeVisible();
  await expect(page.getByTestId('intro')).toHaveCount(0);
});

test('outside the mock the intro shows by default', async ({ page }) => {
  await serveStandIn(page);
  await page.goto('/Who-Did-It/');
  await expect(page.getByTestId('intro-begin')).toBeVisible();
});

test('?intro=1 shows the poster, a tap plays the video and the end leads to the menu', async ({ page }) => {
  await serveStandIn(page);
  await page.goto('/Who-Did-It/?mock=1&intro=1');
  await expect(page.getByTestId('intro-begin')).toBeVisible();
  await expect(page.getByTestId('intro-video')).toBeHidden();
  await page.getByTestId('intro-begin').click();
  await expect(page.getByTestId('intro-video')).toBeVisible();
  await expect(page.getByTestId('intro-skip')).toBeVisible();
  // The clip is 2 s long: the menu follows by itself.
  await expect(landing(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('intro')).toHaveCount(0);
});

test('Skip ends it at once, and it does not play again in the same session', async ({ page }) => {
  await serveStandIn(page);
  await page.goto('/Who-Did-It/?mock=1&intro=1');
  await page.getByTestId('intro-begin').click();
  await page.getByTestId('intro-skip').click();
  await expect(landing(page)).toBeVisible();
  await page.reload();
  await expect(landing(page)).toBeVisible();
  await expect(page.getByTestId('intro')).toHaveCount(0);
});

test('Esc skips, even before the tap', async ({ page }) => {
  await serveStandIn(page);
  await page.goto('/Who-Did-It/?mock=1&intro=1');
  await expect(page.getByTestId('intro-begin')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(landing(page)).toBeVisible();
});

test('?intro=0 and reduced motion go straight to the menu', async ({ page }) => {
  await serveStandIn(page);
  await page.goto('/Who-Did-It/?intro=0');
  await expect(landing(page)).toBeVisible();
  await expect(page.getByTestId('intro')).toHaveCount(0);

  const calm = await page.context().newPage();
  await serveStandIn(calm);
  await calm.emulateMedia({ reducedMotion: 'reduce' });
  await calm.goto('/Who-Did-It/?mock=1&intro=1');
  await expect(landing(calm)).toBeVisible();
  await expect(calm.getByTestId('intro')).toHaveCount(0);
});

test('a missing file or manifest row skips to the menu', async ({ page }) => {
  await serveStandIn(page, { missingFile: true });
  await page.goto('/Who-Did-It/?mock=1&intro=1');
  await expect(landing(page)).toBeVisible();
  await expect(page.getByTestId('intro')).toHaveCount(0);

  const bare = await page.context().newPage();
  await bare.route('**/assets/video/manifest.json', (r) => r.fulfill({ json: { version: 1, entries: [] } }));
  await bare.goto('/Who-Did-It/?mock=1&intro=1');
  await expect(landing(bare)).toBeVisible();
});

test('the admin route never goes through the intro', async ({ page }) => {
  await serveStandIn(page);
  await page.goto('/Who-Did-It/?mock=1&intro=1#/admin');
  await expect(page.getByTestId('admin-controls')).toBeVisible();
  await expect(page.getByTestId('intro')).toHaveCount(0);
});
