import { balance, onubBalance, onubRoles } from '@wdi/content';
import { GameMode } from '@wdi/shared';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { type Swarm, runSwarm } from '../../../tools/bots/swarm';
import { E2E_SERVER_URL } from './env';

// Quick mode (One Night Ultimate Baguette, GDD 3.11) end to end against the real server: two browsers and
// three swarm bots play lobby -> role card -> dusk at the bakery -> the loft -> a night window -> dawn meeting
// with claims and no Skip -> the reveal -> game over with the swap log -> the lobby. It needs the quick-mode
// server (R), the lobby (V), the world (T) and the meeting screens (U), so it runs only with
// WDI_E2E_ONUB=1; the orchestrator sets it at integration. The server runs with WDI_DEBUG=1
// (playwright.config.ts). Screens are located by the frozen data-testid hooks of docs/SESSIONS.md Round 4.
test.skip(
  process.env.WDI_E2E_ONUB !== '1',
  'needs the M3b/M3c sessions R, S, T, U and V merged (WDI_E2E_ONUB=1)',
);

interface PlayerView {
  id: string;
  name: string;
}
interface StateView {
  players: { forEach(cb: (p: PlayerView) => void): void };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const { min, max } = onubBalance.targetLengthMin;
/** The longest a night can run: every window at full length with its fade and jitter, plus the dawn. */
const nightWaitMs =
  (onubBalance.windows.reduce((n, w) => n + w.seconds, 0) +
    onubBalance.windows.length * (onubBalance.timers.fadeS + onubBalance.timers.windowJitterMaxS) +
    onubBalance.timers.dawnS +
    30) *
  1000;

interface Quick {
  host: Page;
  guest: Page;
  code: string;
  swarm: Swarm;
  ids: () => Map<string, string>;
  debug: (type: 'debug.deal' | 'debug.clock', payload: unknown) => void;
  close: () => Promise<void>;
}

/** Create, join, bring three bots in and toggle the quick mode from the host's lobby. */
async function lobby(browser: Browser): Promise<Quick> {
  const ctxs: BrowserContext[] = [await browser.newContext(), await browser.newContext()];
  const [host, guest] = (await Promise.all(ctxs.map((c) => c.newPage()))) as [Page, Page];
  await host.goto('/Who-Did-It/');
  await host.getByLabel('Your name').fill('Hana');
  await host.getByRole('button', { name: 'Create Party' }).click();
  const code = ((await host.getByTestId('party-code').textContent()) ?? '').trim();
  await guest.goto(`/Who-Did-It/#/join/${code}`);
  await guest.getByLabel('Your name').fill('Gus');
  await guest.getByRole('button', { name: 'Join Party' }).click();
  await expect(guest.getByTestId('party-code')).toHaveText(code);

  // Walking bots with claims: in quick mode they set their plate, sleep, act in their window, claim and vote
  // for another seat by themselves (tools/bots/walk.ts).
  const swarm = await runSwarm({ code, count: 3, url: E2E_SERVER_URL, walk: true, claims: true });
  const observer = swarm.rooms[0]!;
  const ids = () => {
    const out = new Map<string, string>();
    (observer.state as unknown as StateView).players.forEach((p) => out.set(p.name, p.id));
    return out;
  };
  await expect(host.getByTestId('player-count')).toHaveText('5 / 10');

  // The host flips the mode; the chip reads the quick-mode text, the observer only reads the setting.
  await host.getByTestId('mode-toggle').click();
  await expect(host.getByTestId('mode-chip')).toContainText(/One Night Ultimate Baguette/i);
  await expect(host.getByTestId('mode-chip')).toContainText(`${min}-${max} min`);
  await expect.poll(() => swarm.settings.mode, { message: 'the observer sees the mode' }).toBe(GameMode.onub);
  await expect(guest.getByTestId('mode-chip')).toContainText(/One Night Ultimate Baguette/i);

  return {
    host,
    guest,
    code,
    swarm,
    ids,
    debug: (type, payload) => observer.send(type, payload),
    close: async () => {
      await swarm.stop();
      await Promise.all(ctxs.map((c) => c.close()));
    },
  };
}

test('a 5-seat quick match: card, dusk, loft, a night window, dawn claims and vote, swap log, lobby', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const q = await lobby(browser);
  try {
    // Host Cutpurse (a window with an act), guest Mourner (no window): the server deals the rest, the deal
    // validates against roles.onub.json in this mode.
    q.debug('debug.deal', {
      roles: { [q.ids().get('Hana')!]: 'cutpurse', [q.ids().get('Gus')!]: 'mourner' },
    });
    await sleep(300);
    await q.host.getByTestId('start').click();
    await q.host.getByTestId('confirm-start').click();

    // Both cards carry the quick-mode line (A39: `beware` is `onubRoles.cardLine`).
    for (const page of [q.host, q.guest]) {
      await expect(page.getByTestId('rolecard')).toBeVisible();
      await expect(page.getByTestId('rolecard')).toContainText(onubRoles.cardLine);
    }
    await expect(q.host.getByTestId('role-name')).toHaveText(/cutpurse/i);
    await expect(q.guest.getByTestId('role-name')).toHaveText(/mourner/i);
    await q.swarm.dealt;
    await q.host.getByTestId('ready').click();
    await q.guest.getByTestId('ready').click();

    // Dusk is spent at the bakery with the plate toast; nobody is in the overworld. The plate prompt itself
    // needs a walk to the own plate (world.spec covers the hold); unset plates are set by the server.
    for (const page of [q.host, q.guest]) {
      await expect(page.getByTestId('entered')).toContainText('bakery');
      await expect(page.locator('.wdi-toasts')).toContainText(/set your plate/i);
    }

    // Night: the loft, one bedroll per seat on every page. Only the page whose dealt role has the open window
    // is woken, and the guest (a Mourner) never is.
    for (const page of [q.host, q.guest]) {
      await expect(page.getByTestId('loft')).toBeVisible({ timeout: (onubBalance.timers.duskS + 20) * 1000 });
      for (const id of q.ids().values()) await expect(page.getByTestId(`bedroll-${id}`)).toBeVisible();
    }
    await expect(q.host.getByTestId('night-wake')).toBeVisible({ timeout: nightWaitMs });
    await expect(q.guest.getByTestId('night-wake')).toBeHidden();
    await expect(q.host.getByTestId('night-wake')).toBeHidden({ timeout: nightWaitMs });

    // One window has run: skip the rest of the night.
    q.debug('debug.clock', { phase: 'dawn' });

    // The dawn meeting: claims by role, no Skip.
    for (const page of [q.host, q.guest]) {
      await expect(page.getByTestId('meeting')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('meeting-reason')).toContainText(/dawn/i);
      await expect(page.getByTestId('vote-skip')).toBeHidden();
      await expect(page.getByTestId('claim-cutpurse')).toBeVisible();
    }
    await q.host.getByTestId('claim-cutpurse').click();

    // Both humans vote for a bot; the bots have voted already, so the vote ends early and stamps (a tie
    // turns out every seat at the top, so there may be more than one stamp).
    const bot = q.ids().get('Bot1')!;
    await q.host.getByTestId(`portrait-${bot}`).click();
    await q.guest.getByTestId(`portrait-${bot}`).click();
    await expect(q.host.getByTestId('stamp').first()).toBeVisible({
      timeout: (onubBalance.timers.voteS + 20) * 1000,
    });

    // Game over: the winner, the final loaf of every seat and the swap log.
    for (const page of [q.host, q.guest]) {
      await expect(page.getByTestId('gameover')).toBeVisible({
        timeout: (onubBalance.timers.revealS + 20) * 1000,
      });
      await expect(page.getByTestId('swaplog')).toBeVisible();
      for (const id of q.ids().values()) await expect(page.getByTestId(`gameover-final-${id}`)).toBeVisible();
    }

    // The room returns to the lobby with the same code, still in quick mode.
    const lobbyWaitMs = (balance.phases.gameOverS + 15) * 1000;
    await expect(q.host.getByTestId('party-code')).toHaveText(q.code, { timeout: lobbyWaitMs });
    await expect(q.guest.getByTestId('party-code')).toHaveText(q.code);
    await expect(q.host.getByTestId('player-count')).toHaveText('5 / 10');
    expect(q.swarm.settings.mode).toBe(GameMode.onub);
    // A sleeper never saw a presence, a scene or a wake that was not its own.
    expect(q.swarm.bots.reduce((n, b) => n + b.stats.nightLeaks, 0)).toBe(0);
  } finally {
    await q.close();
  }
});
