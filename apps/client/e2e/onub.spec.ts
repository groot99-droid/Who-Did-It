import { balance, onubBalance } from '@wdi/content';
import { GameMode } from '@wdi/shared';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { type Swarm, runSwarm } from '../../../tools/bots/swarm';
import { E2E_SERVER_URL } from './env';

// ONUB v2 (quick mode, GDD 3.11) end to end against the real server: two browsers and three fast bots play
// lobby -> role card -> Evening Prep (station, mini-game, hand, commit) -> the crime scenes -> the night (one
// window woken, one sleeper) -> dawn -> the Morning Rush (claims, the Pantry vote) -> the reveal -> game over with
// the act log -> the lobby. It needs ONUB v2 whole (5A to 5D), so it runs only with WDI_E2E_ONUB=1, which the
// orchestrator sets at integration. A match runs about ten minutes (the Rush is 300 s and never ends early).
// Elements are located by the frozen `data-testid` hooks of docs/round5/onub-contract.md section 7 and asserted as
// that table says; no ONUB hook is matched by text. The server runs with WDI_DEBUG=1 (playwright.config.ts).
test.skip(process.env.WDI_E2E_ONUB !== '1', 'needs ONUB v2 (sessions 5A to 5D) merged (WDI_E2E_ONUB=1)');

interface StateView {
  players: { forEach(cb: (p: { id: string; name: string }) => void): void };
  onub: { seats: { forEach(cb: (id: string) => void): void }; ruined: boolean };
}
interface GameOverView {
  onub: { actLog: unknown[] };
}

const { timers } = onubBalance;
const seconds = (s: number) => s * 1000;
/** The longest a night can run: every window at full length with its fade and jitter, plus the dawn. */
const nightWaitMs = seconds(
  onubBalance.windows.reduce((n, w) => n + w.seconds, 0) +
    onubBalance.windows.length * (timers.fadeS + timers.windowJitterMaxS) +
    timers.dawnS +
    30,
);
const stationIds = onubBalance.stations.map((s) => s.id);
/** The 5-seat deck (the default for the party size): the host is dealt the Chef, the guest the Croissant. */
const deck = onubBalance.byCount['5'].deck;
const HOST_ROLE = 'chef';
const GUEST_ROLE = 'croissant';
const notInDeck = onubBalance.windows.map((w) => w.role).find((r) => !deck.includes(r)) as string;
const oven = onubBalance.stations.find((s) => s.id === 'oven')!;

interface Quick {
  host: Page;
  guest: Page;
  code: string;
  swarm: Swarm;
  state: () => StateView;
  ids: () => Map<string, string>;
  debug: (type: 'debug.deal' | 'debug.clock', payload: unknown) => void;
  over: () => GameOverView | null;
  close: () => Promise<void>;
}

/** Create, join, bring three fast bots in and switch the host's lobby to the quick mode. */
async function lobby(browser: Browser): Promise<Quick> {
  const ctxs: BrowserContext[] = [await browser.newContext(), await browser.newContext()];
  const [host, guest] = (await Promise.all(ctxs.map((c) => c.newPage()))) as [Page, Page];
  // The lobby offers the mode toggle only with ?onub=1 until ONUB v2 is merged.
  await host.goto('/Who-Did-It/?onub=1');
  await host.getByLabel('Your name').fill('Hana');
  await host.getByRole('button', { name: 'Create Party' }).click();
  const code = ((await host.getByTestId('party-code').textContent()) ?? '').trim();
  await guest.goto(`/Who-Did-It/#/join/${code}`);
  await guest.getByLabel('Your name').fill('Gus');
  await guest.getByRole('button', { name: 'Join Party' }).click();
  await expect(guest.getByTestId('party-code')).toHaveText(code);

  const swarm = await runSwarm({ code, count: 3, url: E2E_SERVER_URL, walk: false, quick: { pace: 'fast' } });
  const observer = swarm.rooms[0]!;
  let over: GameOverView | null = null;
  observer.onMessage('gameOver', (m: GameOverView) => (over = m));
  const state = () => observer.state as unknown as StateView;
  const ids = () => {
    const out = new Map<string, string>();
    state().players.forEach((p) => out.set(p.name, p.id));
    return out;
  };
  await expect(host.getByTestId('player-count')).toHaveText('5 / 10');

  await host.getByTestId('mode-toggle').click();
  await expect.poll(() => swarm.settings.mode, { message: 'the observer sees the mode' }).toBe(GameMode.onub);
  return {
    host,
    guest,
    code,
    swarm,
    state,
    ids,
    debug: (type, payload) => observer.send(type, payload),
    over: () => over,
    close: async () => {
      await swarm.stop();
      await Promise.all(ctxs.map((c) => c.close()));
    },
  };
}

test('a 5-seat ONUB v2 match: card, prep, crime scenes, night, dawn, Rush, reveal, act log, lobby', async ({
  browser,
}) => {
  test.setTimeout(seconds(1200));
  const q = await lobby(browser);
  const pages = [q.host, q.guest];
  try {
    // The deck editor shows in quick mode; the leader may toggle roles, the guest may not; the default deck fits.
    await expect(q.host.getByTestId('deck-editor')).toBeVisible();
    await expect(q.guest.getByTestId('deck-editor')).toBeVisible();
    await expect(q.host.getByTestId('deck-role-champignon')).toBeEnabled();
    await expect(q.guest.getByTestId('deck-role-champignon')).toBeDisabled();
    // Reset shows only when there is a custom deck to drop (5C's DeckEditor), so not on the default deck.
    await expect(q.host.getByTestId('deck-reset')).toBeHidden();
    await expect(q.guest.getByTestId('deck-reset')).toBeHidden();
    await expect(q.host.getByTestId('deck-problem')).toBeHidden();

    const ids = q.ids();
    const hostId = ids.get('Hana')!;
    const guestId = ids.get('Gus')!;
    q.debug('debug.deal', { roles: { [hostId]: HOST_ROLE, [guestId]: GUEST_ROLE } });
    await new Promise((r) => setTimeout(r, 300));
    await q.host.getByTestId('start').click();
    await q.host.getByTestId('confirm-start').click();

    // The role card, then Ready (private: no spec reads another seat's readiness).
    for (const page of pages) {
      await expect(page.getByTestId('rolecard')).toBeVisible();
      await expect(page.getByTestId('role-name')).toBeVisible();
    }
    await q.swarm.dealt;
    for (const page of pages) await page.getByTestId('ready').click();

    // Evening Prep: the kitchen with its four stations. The host works the Oven; the guest lets the clock run
    // and the server commits for it.
    for (const page of pages) {
      await expect(page.getByTestId('kitchen')).toBeVisible({ timeout: seconds(timers.roleCardS + 10) });
      await expect(page.getByTestId('onub-clock')).toBeVisible();
      for (const id of stationIds) {
        await expect(page.getByTestId(`station-${id}`)).toHaveCount(1);
        await expect(page.getByTestId(`station-${id}`)).toBeEnabled();
      }
    }
    await q.host.getByTestId('station-oven').click();
    await expect(q.host.getByTestId('station-room')).toBeVisible();
    await expect(q.host.getByTestId('station-back')).toBeVisible();
    await expect(q.host.getByTestId('hand')).toBeHidden();
    await expect(q.host.getByTestId('minigame-oven')).toBeVisible();
    await expect(q.host.getByTestId('minigame-assist')).toBeVisible({
      timeout: seconds(timers.minigameAssistS + 5),
    });
    await q.host.getByTestId('minigame-assist').click();
    await expect(q.host.getByTestId('hand')).toBeVisible();
    for (const card of oven.good) await expect(q.host.getByTestId(`card-${card}`)).toBeVisible();
    // A Baker's hand holds no sabotage card.
    for (const card of oven.sabotage) await expect(q.host.getByTestId(`card-${card}`)).toHaveCount(0);
    await expect(q.host.getByTestId('prep-commit')).toBeDisabled();
    await q.host.getByTestId(`card-${oven.good[0]}`).click();
    await expect(q.host.getByTestId('prep-commit')).toBeEnabled();
    await q.host.getByTestId('prep-commit').click();
    await expect(q.host.getByTestId('prep-done')).toBeVisible();
    await expect(q.host.getByTestId('station-back')).toBeHidden();
    // The guest never committed: its page still shows the waiting panel once the server has.
    await expect(q.guest.getByTestId('prep-done')).toBeVisible({ timeout: seconds(timers.prepS + 10) });

    // The crime scenes: the board, the four piles and the ruin banner exactly when the dough was ruined.
    for (const page of pages) {
      await expect(page.getByTestId('prep-board')).toBeVisible({ timeout: seconds(5) });
      for (const id of stationIds)
        await expect(page.getByTestId('prep-board').getByTestId(`pile-${id}`)).toHaveCount(1);
      await expect(page.getByTestId('ruin-banner'))[q.state().onub.ruined ? 'toBeVisible' : 'toBeHidden']();
    }

    // The night: lights out on a sleeper's page, the narrator on every page, the Chef's table on the host's alone.
    for (const page of pages) {
      await expect(page.getByTestId('night')).toBeVisible({ timeout: seconds(timers.prepRevealS + 10) });
      await expect(page.getByTestId('narrator')).toBeVisible({ timeout: nightWaitMs });
    }
    await expect(q.guest.getByTestId('lights-out')).toBeVisible();
    await expect(q.guest.getByTestId('night-wake')).toBeHidden();
    await expect(q.host.getByTestId('night-wake')).toBeVisible({ timeout: nightWaitMs });
    await expect(q.host.getByTestId('lights-out')).toBeHidden();
    await expect(q.host.getByTestId('card-table')).toBeVisible();
    const seats: string[] = [];
    q.state().onub.seats.forEach((id) => seats.push(id));
    const slots = 2 * seats.length + onubBalance.pantry.roles + onubBalance.pantry.locations;
    await expect(q.host.locator('[data-testid^="slot-"]')).toHaveCount(slots);
    await expect(q.host.getByTestId('act-onub.peekRole')).toBeVisible();
    await expect(q.host.getByTestId('act-confirm')).toBeDisabled();
    await q.host.getByTestId('act-onub.peekRole').click();
    const other = seats.findIndex((id) => id !== hostId);
    await q.host.getByTestId(`slot-seat.${other}.role`).click();
    await expect(q.host.getByTestId('act-confirm')).toBeEnabled();
    await q.host.getByTestId('act-confirm').click();
    await expect(q.host.getByTestId('night-done')).toBeVisible();
    await expect(q.host.getByTestId('night-reveal')).toBeVisible();
    await expect(q.host.getByTestId('night-reveal-entry')).toHaveCount(1);
    await expect(q.host.getByTestId('night-wake')).toBeHidden({ timeout: nightWaitMs });

    // Dawn, then the Morning Rush: the board, the Pantry tile and no Skip, claims, and one vote each.
    for (const page of pages) {
      await expect(page.getByTestId('dawn')).toBeVisible({ timeout: nightWaitMs });
      await expect(page.getByTestId('meeting')).toBeVisible({ timeout: seconds(timers.dawnS + 20) });
      await expect(page.getByTestId('rush-board')).toBeVisible();
      await expect(page.getByTestId('vote-pantry')).toBeVisible();
      await expect(page.getByTestId('vote-skip')).toBeHidden();
    }
    const bots = [...ids.entries()].filter(([name]) => name.startsWith('Bot')).map(([, id]) => id);
    await expect(q.host.getByTestId(`portrait-${hostId}`)).toBeDisabled();
    for (const id of bots) await expect(q.host.getByTestId(`portrait-${id}`)).toBeEnabled();

    await q.host.getByTestId('claim-open').click();
    await expect(q.host.getByTestId(`claim-role-${HOST_ROLE}`)).toBeVisible();
    await expect(q.host.getByTestId(`claim-role-${notInDeck}`)).toHaveCount(0);
    await expect(q.host.getByTestId('claim-post')).toBeDisabled();
    await q.host.getByTestId(`claim-role-${HOST_ROLE}`).click();
    await q.host.getByTestId('claim-station-oven').click();
    await q.host.getByTestId(`claim-card-${oven.good[0]}`).click();
    await expect(q.host.getByTestId('claim-post')).toBeEnabled();
    await q.host.getByTestId('claim-post').click();
    await expect(q.guest.getByTestId(`claimed-${hostId}`)).toBeVisible();
    // The fast bots claim within seconds of the Rush opening.
    for (const id of bots)
      await expect(q.host.getByTestId(`claimed-${id}`)).toBeVisible({ timeout: seconds(30) });

    await q.host.getByTestId(`portrait-${bots[0]}`).click();
    await q.guest.getByTestId('vote-pantry').click();

    // The Rush never ends early; CRUST follows, and the reveal shows who went in the oven.
    const rushMs = seconds(onubBalance.timers.rushS + onubBalance.timers.voteS + 30);
    for (const page of pages) {
      await expect(page.getByTestId('stamp').first()).toBeVisible({ timeout: rushMs });
      await expect(page.getByTestId('reveal-role').first()).toBeVisible();
      // The deck holds no Critique, so nobody was dragged in.
      await expect(page.getByTestId('reveal-hop')).toBeHidden();
    }

    // Game over: the winner, every seat's final cards, the Pantry, the piles and the act log.
    const everyone = [...ids.values()];
    for (const page of pages) {
      await expect(page.getByTestId('gameover')).toBeVisible({ timeout: seconds(timers.revealS + 20) });
      await expect(page.getByTestId('gameover-winner')).toBeVisible();
      for (const id of everyone) {
        await expect(page.getByTestId(`gameover-final-${id}`)).toBeVisible();
        await expect(page.getByTestId(`gameover-loc-${id}`)).toBeVisible();
      }
      await expect(page.getByTestId('gameover-pantry')).toBeVisible();
      for (let k = 0; k < onubBalance.pantry.roles; k++)
        await expect(page.getByTestId(`gameover-pantry-role-${k}`)).toHaveCount(1);
      for (let k = 0; k < onubBalance.pantry.locations; k++)
        await expect(page.getByTestId(`gameover-pantry-loc-${k}`)).toHaveCount(1);
      await expect(page.getByTestId('gameover-piles')).toBeVisible();
      await expect(page.getByTestId('actlog')).toBeVisible();
      await expect(page.getByTestId('actlog-entry')).toHaveCount(q.over()!.onub.actLog.length);
    }

    // The room returns to the lobby with the same code, still in quick mode, and nobody learned anything in the
    // dark that was not theirs (a sleeper's `nightWake` or `nightReveal`, or any presence).
    const lobbyWaitMs = seconds(balance.phases.gameOverS + 15);
    await expect(q.host.getByTestId('party-code')).toHaveText(q.code, { timeout: lobbyWaitMs });
    await expect(q.guest.getByTestId('party-code')).toHaveText(q.code);
    await expect(q.host.getByTestId('player-count')).toHaveText('5 / 10');
    expect(q.swarm.settings.mode).toBe(GameMode.onub);
    expect(q.swarm.bots.reduce((n, b) => n + b.stats.nightLeaks, 0)).toBe(0);
  } finally {
    await q.close();
  }
});
