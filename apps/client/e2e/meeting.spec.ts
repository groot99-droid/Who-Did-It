import { expect, test, type Page } from '@playwright/test';

// The meeting, the reveal, game over and the way back to the lobby against the ?mock=1 feeds (no server).
// The mock world will request a meeting itself once the world session lands; until then the router's
// mock-only hook sends the same `meetingRequest` the mock world sends.

interface MockHook {
  requestMeeting(reason?: 'body' | 'bell' | 'dawn'): void;
}

async function toWorld(page: Page) {
  await page.goto('/Who-Did-It/?mock=1');
  await page.getByLabel('Your name').fill('Hana');
  await page.getByRole('button', { name: 'Create Party' }).click();
  await expect(page.getByTestId('player-list')).toContainText('Hana');
  await expect(page.getByTestId('start')).toBeEnabled();
  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await page.getByTestId('ready').click();
  await expect(page.getByTestId('hud-clock')).toBeVisible();
}

const request = (page: Page, reason: 'body' | 'bell' | 'dawn') =>
  page.evaluate((r) => (window as unknown as { __wdiMock: MockHook }).__wdiMock.requestMeeting(r), reason);

test('a body opens the meeting, one vote ends it early, the stamp lands, game over, then the lobby', async ({
  page,
}, info) => {
  await toWorld(page);
  await request(page, 'body');

  await expect(page.getByTestId('meeting')).toBeVisible();
  await expect(page.getByTestId('meeting-reason')).toHaveText("Hana reported Bo's body");
  // The world sleeps behind the meeting; the dead have a portrait but no vote.
  await expect(page.getByTestId('portrait-mock-bot-2')).toBeDisabled();
  await expect(page.getByTestId('portrait-mock-bot-2')).toHaveClass(/is-dead/);
  await expect(page.getByTestId('portrait-mock-me')).toHaveClass(/is-self/);
  await expect(page.getByTestId('stamp')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('meeting-discussion.png') });

  // Chat: the log and the form.
  await page.getByTestId('chat-input').fill('I was at the well');
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-log')).toContainText('I was at the well');

  // Tap a portrait to vote; the vote shows as yours.
  const started = Date.now();
  await page.getByTestId('portrait-mock-bot-1').click();
  await expect(page.getByTestId('portrait-mock-bot-1')).toHaveClass(/is-selected/);
  // A bot's "Voted" chip shows until the last vote lands, then the reveal hides it: either proves the votes came in
  // (a heavier paint, such as the night theme's glass, can take a screenshot past the bots' short window).
  await expect(
    page.locator('[data-testid="voted-mock-bot-3"]:visible, [data-testid="stamp"]:visible').first(),
  ).toBeVisible({ timeout: 10_000 });

  // Everyone voted: the reveal starts at once, long before the discussion would have ended.
  await expect(page.getByTestId('stamp')).toBeVisible({ timeout: 15_000 });
  expect(Date.now() - started).toBeLessThan(20_000);
  await expect(page.getByTestId('reveal-role')).toContainText('is ejected');
  await expect(page.locator('[data-testid^="vote-count-"]:visible').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('meeting-reveal.png') });

  // The reveal runs its length, then the match ends.
  await expect(page.getByTestId('gameover')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('gameover-winner')).toContainText('wins');
  await expect(page.getByTestId('gameover-role-mock-me')).toContainText('Killer');
  await expect(page.getByTestId('gameover-role-mock-bot-1')).toBeVisible();
  await page.screenshot({ path: info.outputPath('gameover.png') });

  // The countdown ends in the lobby, with the party still seated.
  await expect(page.getByTestId('party-code')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('player-list')).toContainText('Hana');
  await expect(page.getByTestId('gameover')).toHaveCount(0);
});

test('a bell with nobody ejected sends the party back to the village', async ({ page }) => {
  await toWorld(page);
  await request(page, 'bell');
  await expect(page.getByTestId('meeting-reason')).toHaveText('Hana rang the bell');
  await page.getByTestId('vote-skip').click();
  await expect(page.getByTestId('vote-skip')).toHaveClass(/is-selected/);

  await expect(page.getByTestId('reveal-role')).toHaveText('The village skipped. Nobody is ejected.', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('stamp')).toHaveCount(0);
  // The next sceneEnter ends the meeting and the world wakes.
  await expect(page.getByTestId('meeting')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId('hud-clock')).toBeVisible();
});
