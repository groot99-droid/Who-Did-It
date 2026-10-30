import { expect, test, type Page } from '@playwright/test';
import { createParty } from './fixtures/party';

// Round 10, 10Y (UI.md 14.51; failures.md 6): every refusal's line on a phone and on a desktop. `?m5b=bare` stands the
// own seat beside the tin node without a spade, so the gather prompt greys ("Gather Tin Ore (needs a spade)") and a
// press shakes it; `window.__wdiMock.refuse` sends the frames a server would. The second identical NEED_TOOL within
// 30 s carries the table's hint; the longest `fail` line and an NFY line fit the log. The screenshots are the set of
// UI.md 12 (`refusal-390w.png`, `refusal-1280x720.png`).

interface Mock {
  refuse(reason: string, args?: Record<string, unknown>, interaction?: string): void;
}

async function toWorld(page: Page, query: string) {
  await page.goto(`/Who-Did-It/?mock=1${query}`);
  await createParty(page, 'Hana');
  await expect(page.getByTestId('player-list')).toContainText('Hana');
  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await page.getByTestId('ready').click();
  await expect(page.getByTestId('hud-clock')).toBeVisible();
}

const refuse = (page: Page, reason: string, args?: Record<string, unknown>, interaction?: string) =>
  page.evaluate(([r, a, i]) => (window as unknown as { __wdiMock: Mock }).__wdiMock.refuse(r, a, i), [
    reason,
    args,
    interaction,
  ] as const);

for (const [name, width, height, query] of [
  ['390w', 390, 844, '&touch=1'],
  ['1280x720', 1280, 720, ''],
] as const) {
  test(`refusal lines fit the log at ${name}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await toWorld(page, `&m5b=bare${query}`);

    // The greyed prompt: the tin node is in reach, the spade is not in the pockets; a press sends nothing.
    const prompt = page.getByTestId('m5b-prompt');
    await expect(prompt).toHaveText('Gather Tin Ore (needs a spade)', { timeout: 10_000 });
    await expect(prompt).toHaveClass(/is-blocked/);
    await expect(prompt).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('KeyE');
    await expect(prompt).toHaveText('Gather Tin Ore (needs a spade)');

    // The second identical refusal carries the hint; the first does not.
    const log = page.locator('.wdi-log');
    await refuse(page, 'NEED_TOOL', { need: 'axe' }, 'chopLumber');
    await expect(log).toContainText('axe');
    await expect(log).not.toContainText('lumber camp');
    await refuse(page, 'NEED_TOOL', { need: 'axe' }, 'chopLumber');
    await expect(log).toContainText('Axes hang in the lumber camp and sell at the general store.');

    // The longest fail line of the table, and an NFY line drawn apart.
    await refuse(page, 'NEED_TOOL', { need: 'crowbar' }, 'cutTimberSet');
    await expect(log).toContainText('The timbers are set too hard to pull by hand.');
    await refuse(page, 'NFY', { feature: 'the hitman' });
    await expect(log.locator('.wdi-log__line--nfy')).toContainText('NFY: the hitman.');

    // Every line sits inside the viewport, clear of the clock and the village's work bar, and no line is wider
    // than the log lets it be.
    const box = await log.boundingBox();
    expect(box).not.toBeNull();
    for (const id of ['hud-clock', 'work']) {
      const other = await page.getByTestId(id).boundingBox();
      expect(other).not.toBeNull();
      const apart =
        box!.y >= other!.y + other!.height ||
        other!.y >= box!.y + box!.height ||
        box!.x >= other!.x + other!.width ||
        other!.x >= box!.x + box!.width;
      expect(apart, `the log overlaps ${id}`).toBe(true);
    }
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);
    expect(box!.y + box!.height).toBeLessThanOrEqual(height + 0.5);
    const overflow = await log.evaluate((el) =>
      [...el.querySelectorAll('.wdi-log__line')].some((p) => p.scrollWidth > p.clientWidth + 1),
    );
    expect(overflow).toBe(false);

    await page.screenshot({ path: info.outputPath(`refusal-${name}.png`) });
  });
}
