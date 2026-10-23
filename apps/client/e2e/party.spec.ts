import { roles } from '@wdi/content';
import { expect, test, type Page } from '@playwright/test';
import { runSwarm } from '../../../tools/bots/swarm';
import { E2E_SERVER_URL } from './env';
import { createParty, enterWorld, joinParty } from './fixtures/party';

// Two real browsers against the real server: create, join by deep link, Start with four swarm bots,
// and each browser shows its own role card from the server.

// Any card of the main deck (round 5 deals the Werewolf-inspired roles too, GDD 3.2).
const SKIP_INTRO = "sessionStorage.setItem('wdi:introSeen', '1')"; // no opening cinematic (6Q)
const KNOWN_ROLES = Object.values(roles.roles).map((r) => r.name);

async function cardRole(page: Page): Promise<string> {
  await expect(page.getByTestId('rolecard')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('role-name')).not.toHaveText('');
  return (await page.getByTestId('role-name').textContent()) ?? '';
}

test('create, join by deep link, start with 4 bots, both browsers get a role card', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  await Promise.all([hostCtx, guestCtx].map((c) => c.addInitScript(SKIP_INTRO)));
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  await host.goto('/Who-Did-It/');
  await createParty(host, 'Hana');
  const code = ((await host.getByTestId('party-code').textContent()) ?? '').trim();
  expect(code).toMatch(/^[A-Z2-9]{5}$/);

  // The invite link opens the join screen with the code filled in.
  await guest.goto(`/Who-Did-It/#/join/${code}`);
  await expect(guest.getByLabel('Party code')).toHaveValue(code);
  await joinParty(guest, code, 'Gus');
  await expect(guest.getByTestId('party-code')).toHaveText(code);
  await expect(guest.getByTestId('start')).toBeHidden();

  const swarm = await runSwarm({ code, count: 4, url: E2E_SERVER_URL });
  try {
    await expect(host.getByTestId('player-count')).toHaveText('6 / 10');
    await expect(host.getByTestId('player-list')).toContainText('Bot4');

    await host.getByTestId('start').click();
    await host.getByTestId('confirm-start').click();

    const hostRole = await cardRole(host);
    const guestRole = await cardRole(guest);
    expect(KNOWN_ROLES).toContain(hostRole);
    expect(KNOWN_ROLES).toContain(guestRole);
    await swarm.dealt;

    // Ready dismisses the card; once everyone is ready the server sends the overworld.
    await host.getByTestId('ready').click();
    await guest.getByTestId('ready').click();
    await enterWorld(host);
    await enterWorld(guest);
    // The World scene starts from the same sceneEnter (M2): its HUD timer is the proof of entry.
    await expect(host.getByTestId('hud-clock')).toBeVisible();
    await expect(guest.getByTestId('hud-clock')).toBeVisible();
    await expect(host.getByTestId('rolecard')).toBeHidden();
    await host.keyboard.press('Tab');
    await expect(host.getByTestId('role-name')).toHaveText(hostRole);
  } finally {
    await swarm.stop();
    await hostCtx.close();
    await guestCtx.close();
  }
});

test('a full or started party refuses a late joiner with the generic error', async ({ browser, page }) => {
  const hostCtx = await browser.newContext();
  await hostCtx.addInitScript(SKIP_INTRO);
  await page.addInitScript(SKIP_INTRO);
  const host = await hostCtx.newPage();
  await host.goto('/Who-Did-It/');
  await createParty(host, 'Hana');
  const code = ((await host.getByTestId('party-code').textContent()) ?? '').trim();
  await host.getByTestId('start').click();
  await host.getByTestId('confirm-start').click();
  await cardRole(host);

  await page.goto(`/Who-Did-It/#/join/${code}`);
  await joinParty(page, code, 'Late');
  await expect(page.getByRole('alert')).toHaveText('party not found or unavailable');
  await hostCtx.close();
});

// Mock lobby (no server): NPC seats come and go.
test('the leader adds and removes NPC seats', async ({ page }) => {
  await page.goto('/Who-Did-It/?mock=1');
  await createParty(page, 'Hana');
  await expect(page.getByTestId('player-count')).toHaveText('4 / 10', { timeout: 5000 });

  await expect(page.getByTestId('remove-npc')).toBeHidden();
  await expect(page.getByTestId('npc-difficulty')).toBeDisabled();
  await page.getByTestId('add-npc').click();
  await expect(page.getByTestId('player-count')).toHaveText('5 / 10');
  await expect(page.getByTestId('remove-npc')).toBeVisible();
  await page.getByTestId('remove-npc').click();
  await expect(page.getByTestId('player-count')).toHaveText('4 / 10');
  await expect(page.getByTestId('remove-npc')).toBeHidden();
});
