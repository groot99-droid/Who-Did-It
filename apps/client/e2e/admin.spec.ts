import { expect, test, type Page } from '@playwright/test';

// The admin page against the scripted feed of `admin/mockAdmin.ts` (`?mock=1#/admin`). The live path, with a real
// GitHub login, is opt-in: `WDI_E2E_ADMIN=1` plus the `WDI_ADMIN_*` variables on the server it runs against, and a
// token in `WDI_E2E_ADMIN_TOKEN` (docs/round6/seams.md 8; checked at integration, 6P).

const sent = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __wdiAdminSent: Array<{ type: string; payload: unknown }> }).__wdiAdminSent,
  );

async function open(page: Page): Promise<void> {
  await page.goto('/Who-Did-It/?mock=1#/admin');
  await expect(page.getByTestId('admin-controls')).toBeVisible();
}

test('six viewports show for six occupied scenes and the seventh queues', async ({ page }) => {
  await open(page);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const g = (
          window as unknown as { __wdiGame: { scene: { scenes: Array<{ scene: { key: string } }> } } }
        ).__wdiGame;
        return g.scene.scenes.map((s) => s.scene.key).filter((k) => k.startsWith('AdminView:')).length;
      }),
    )
    .toBe(6);
  await expect(page.getByTestId('admin-queue').getByRole('button')).toHaveCount(1);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/admin-grid.png' });
});

test('the speed buttons, pause and step send admin.clock', async ({ page }) => {
  await open(page);
  await page.getByTestId('admin-scale-10').click();
  await page.getByTestId('admin-pause').click();
  await page.getByTestId('admin-step-count').fill('3');
  await page.getByTestId('admin-step').click();
  const msgs = await sent(page);
  expect(msgs).toContainEqual({ type: 'admin.clock', payload: { scale: 10 } });
  expect(msgs).toContainEqual({ type: 'admin.clock', payload: { paused: true } });
  expect(msgs).toContainEqual({ type: 'admin.clock', payload: { paused: true, step: 3 } });
  await expect(page.getByTestId('admin-status')).toContainText('paused');
});

test('Start sends the setup and the start; a bad seed line is refused', async ({ page }) => {
  await open(page);
  await page.getByTestId('admin-setup').locator('summary').click();
  await page.getByTestId('admin-seeds').fill('world 1 2 3');
  await page.getByTestId('admin-start').click();
  await expect(page.getByTestId('admin-seeds-error')).toBeVisible();
  await page.getByTestId('admin-seeds').fill('world 1 2 3 4');
  await page.getByTestId('admin-seats').fill('8');
  await page.getByTestId('admin-start').click();
  const msgs = await sent(page);
  expect(msgs).toContainEqual({
    type: 'admin.setup',
    payload: {
      map: 'hollowmere',
      seats: 8,
      difficulty: 'normal',
      seeds: { world: [1, 2, 3, 4] },
    },
  });
  expect(msgs.at(-1)).toEqual({ type: 'admin.start', payload: {} });
});

test('an invariant failure renders as a red row and stays until Reset', async ({ page }) => {
  await open(page);
  const row = page.getByTestId('admin-log-failure');
  await expect(row).toContainText('noNpcStuck', { timeout: 20_000 });
  await expect(row).toHaveCSS('background-color', /rgb\(/);
  await page.getByTestId('admin-reset').click();
  await expect(page.getByTestId('admin-log-failure')).toHaveCount(0);
  expect((await sent(page)).some((m) => m.type === 'admin.reset')).toBe(true);
});

test("the inspector shows a cover's true role", async ({ page }) => {
  await open(page);
  await page.getByTestId('admin-seat-s1').click();
  await expect(page.getByTestId('admin-detail-role')).toHaveText('killer');
  await expect(page.getByTestId('admin-detail-cover')).toContainText('wears the look of baker');
});

test('follow collapses the grid to the seat’s scene; the queue swaps a scene in', async ({ page }) => {
  await open(page);
  const views = () =>
    page.evaluate(() => {
      const g = (window as unknown as { __wdiGame: { scene: { scenes: Array<{ scene: { key: string } }> } } })
        .__wdiGame;
      return g.scene.scenes.map((s) => s.scene.key).filter((k) => k.startsWith('AdminView:'));
    });
  await expect.poll(async () => (await views()).length).toBe(6);
  await page.getByTestId('admin-queue').getByRole('button').click();
  await expect.poll(async () => (await views())[0]).toBeTruthy();
  await page.getByTestId('admin-seat-s3').click();
  await page.getByTestId('admin-follow').click();
  await expect.poll(async () => await views()).toEqual(['AdminView:tavern_bar']);
  await page.getByTestId('admin-follow').click();
  await expect.poll(async () => (await views()).length).toBe(6);
});

test('without a token the live page offers the GitHub sign-in', async ({ page }) => {
  await page.goto('/Who-Did-It/#/admin');
  await expect(page.getByTestId('admin-signin')).toBeVisible();
});

test('a callback token moves to session storage and leaves the hash', async ({ page }) => {
  // No admin server runs here, so the join is refused and the page clears the token again; record the write.
  await page.addInitScript(() => {
    const w = window as unknown as { __wdiStored: string[] };
    w.__wdiStored = [];
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'wdi:adminToken') w.__wdiStored.push(v);
      return set.call(this, k, v);
    };
  });
  await page.goto('/Who-Did-It/#/admin?token=abc.def');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/admin');
  expect(await page.evaluate(() => (window as unknown as { __wdiStored: string[] }).__wdiStored)).toEqual([
    'abc.def',
  ]);
});

test.describe('live room (opt-in)', () => {
  test.skip(
    process.env.WDI_E2E_ADMIN !== '1',
    'set WDI_E2E_ADMIN=1 with the WDI_ADMIN_* variables and a token',
  );

  test('joins the admin room with a token and shows the snapshot status', async ({ page }) => {
    const token = process.env.WDI_E2E_ADMIN_TOKEN ?? '';
    await page.goto(`/Who-Did-It/#/admin?token=${encodeURIComponent(token)}`);
    await expect(page.getByTestId('admin-controls')).toBeVisible();
    await page.getByTestId('admin-start').click();
    await expect(page.getByTestId('admin-status')).toContainText('Tick');
  });
});
