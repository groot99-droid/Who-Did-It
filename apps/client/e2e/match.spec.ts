import { balance } from '@wdi/content';
import { TILE_PX } from '@wdi/shared';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { type Swarm, runSwarm } from '../../../tools/bots/swarm';
import { E2E_SERVER_URL } from './env';
import { skipOpening } from './helpers';
import { createParty, joinParty } from './fixtures/party';

// The first playable, end to end against the real server (M3): two browsers and bots play kill -> body ->
// report -> meeting -> vote -> game over -> lobby. It waited behind WDI_E2E_MATCH=1 for the M3 sessions K, L,
// M and N; they are long merged and the suite runs in CI (A514), so it runs with the rest (A554). The server
// runs with WDI_DEBUG=1 (playwright.config.ts): a bot sends `debug.deal` and `debug.clock`. Screens are located
// by the frozen data-testid lists of docs/SESSIONS.md Round 3.

interface PlayerView {
  id: string;
  name: string;
}
/** Round 5 (A50): other seats are avatars in the scene's view, `lookOf` names the seat drawn. */
interface SceneView {
  bodies: { size: number };
  avatars: { forEach(cb: (a: { lookOf: string; x: number; y: number }) => void): void };
}
interface StateView {
  players: { forEach(cb: (p: PlayerView) => void): void };
  scenes: { get(key: string): SceneView | undefined };
}

interface Match {
  host: Page;
  guest: Page;
  code: string;
  swarm: Swarm;
  /** Public roster of the observer bot: name to player id. */
  ids: () => Map<string, string>;
  /** Tile distance between two players as the observer bot sees them. */
  tilesBetween: (a: string, b: string) => number;
  at: (name: string) => { x: number; y: number } | undefined;
  debug: (type: 'debug.deal' | 'debug.clock', payload: unknown) => void;
  bodies: () => number;
  close: () => Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Create, join, bring the bots in, fix the deal (the host is the Killer), Start, and dismiss both cards. */
async function startMatch(browser: Browser, botCount: number, botVote: string): Promise<Match> {
  const ctxs: BrowserContext[] = [await browser.newContext(), await browser.newContext()];
  await Promise.all(ctxs.map((c) => c.addInitScript("sessionStorage.setItem('wdi:introSeen', '1')"))); // no opening cinematic (6Q)
  const [host, guest] = (await Promise.all(ctxs.map((c) => c.newPage()))) as [Page, Page];

  await host.goto('/Who-Did-It/');
  await createParty(host, 'Hana');
  const code = ((await host.getByTestId('party-code').textContent()) ?? '').trim();
  await guest.goto(`/Who-Did-It/#/join/${code}`);
  await joinParty(guest, code, 'Gus');
  await expect(guest.getByTestId('party-code')).toHaveText(code);

  // Standing bots (`walk: false`) keep their spawn: Bot1 on square_2, Bot2 on square_3. They cast
  // `botVote` as soon as a meeting opens.
  const swarm = await runSwarm({ code, count: botCount, url: E2E_SERVER_URL, walk: false, vote: botVote });
  const observer = swarm.rooms[0]!;
  const roster = () => {
    const out = new Map<string, string>();
    (observer.state as unknown as StateView).players.forEach((p) => out.set(p.name, p.id));
    return out;
  };
  const position = (name: string) => {
    const id = roster().get(name);
    let at: { x: number; y: number } | undefined;
    (observer.state as unknown as StateView).scenes.get('overworld')?.avatars.forEach((a) => {
      if (a.lookOf === id) at = a;
    });
    return at;
  };
  const m: Match = {
    host,
    guest,
    code,
    swarm,
    ids: roster,
    at: position,
    tilesBetween: (a, b) => {
      const pa = position(a);
      const pb = position(b);
      return pa && pb ? Math.hypot(pa.x - pb.x, pa.y - pb.y) / TILE_PX : Infinity;
    },
    debug: (type, payload) => observer.send(type, payload),
    bodies: () => (observer.state as unknown as StateView).scenes.get('overworld')?.bodies.size ?? 0,
    close: async () => {
      await swarm.stop();
      await Promise.all(ctxs.map((c) => c.close()));
    },
  };

  await expect(host.getByTestId('player-count')).toHaveText(`${botCount + 2} / 10`);
  m.debug('debug.deal', { roles: { [m.ids().get('Hana')!]: 'killer' } });
  await sleep(300);
  await host.getByTestId('start').click();
  await host.getByTestId('confirm-start').click();
  await expect(host.getByTestId('role-name')).toHaveText('Killer');
  await expect(guest.getByTestId('rolecard')).toBeVisible();
  await swarm.dealt;
  await host.getByTestId('ready').click();
  await guest.getByTestId('ready').click();
  await Promise.all([skipOpening(host), skipOpening(guest)]);
  await expect(host.getByTestId('hud-clock')).toBeVisible();
  await expect(guest.getByTestId('hud-clock')).toBeVisible();
  // Out of grace with the Knife ready: the Kill is allowed from dusk to the last night only (abilities.json).
  // Dusk, not night: since round 8 (8L, A190; GDD 3.7) a living seat sees another at night only within the
  // night radius, and the observer bot, which this spec reads positions from, stands on its own spawn, so at
  // night its view never held the host, and the walk below had nothing to steer by (A554).
  m.debug('debug.clock', { phase: 'dusk', clearCooldowns: true });
  return m;
}

/**
 * Steer the host toward `victim` with the four movement keys until it stands within a tile, then release them.
 * The spawn squares moved with the round-5 and round-6 maps, so the way is read off the avatars, not assumed.
 */
async function walkToward(m: Match, victim: string, ms = 30_000): Promise<void> {
  const held = new Set<string>();
  const set = async (key: string, on: boolean) => {
    if (on === held.has(key)) return;
    if (on) held.add(key);
    else held.delete(key);
    await (on ? m.host.keyboard.down(key) : m.host.keyboard.up(key));
  };
  try {
    for (
      const t0 = Date.now();
      m.tilesBetween('Hana', victim) > 1.1 && Date.now() - t0 < ms;
      await sleep(30)
    ) {
      const me = m.at('Hana');
      const to = m.at(victim);
      if (!me || !to) continue;
      const slack = TILE_PX / 4;
      await set('KeyD', to.x - me.x > slack);
      await set('KeyA', me.x - to.x > slack);
      await set('KeyS', to.y - me.y > slack);
      await set('KeyW', me.y - to.y > slack);
    }
  } finally {
    for (const key of [...held]) await set(key, false);
  }
  expect(m.tilesBetween('Hana', victim), 'the host reached its target').toBeLessThanOrEqual(1.1);
}

/** The host walks to `victim`, strikes with Q and reports the body with E. */
async function killAndReport(m: Match, victim: string): Promise<void> {
  await walkToward(m, victim);
  await m.host.keyboard.press('KeyQ');
  await expect.poll(m.bodies, { message: 'a body appears' }).toBe(1);
  await expect(m.host.getByTestId('prompt')).toContainText(/report/i);
  await m.host.keyboard.press('KeyE');
  await expect(m.host.getByTestId('meeting')).toBeVisible();
  await expect(m.guest.getByTestId('meeting')).toBeVisible();
  await expect(m.host.getByTestId('meeting-reason')).toContainText(/reported/i);
}

async function allRolesShown(m: Match, page: Page): Promise<void> {
  for (const id of m.ids().values()) await expect(page.getByTestId(`gameover-role-${id}`)).toBeVisible();
}

const gameOverWaitMs = (balance.phases.revealS + 10) * 1000;
const lobbyWaitMs = (balance.phases.gameOverS + 15) * 1000;

test('a 5-seat match: the host kills the guest, everyone votes the host, Village wins, the lobby returns', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const m = await startMatch(browser, 3, 'Hana');
  try {
    // The guest stands on square_1, east of the host's square_0.
    await killAndReport(m, 'Gus');
    // The guest is a ghost and cannot vote; the host and the three bots vote the host.
    const hostId = m.ids().get('Hana')!;
    await m.host.getByTestId(`portrait-${hostId}`).click();
    await expect(m.host.getByTestId('stamp')).toBeVisible();
    await expect(m.host.getByTestId('reveal-role')).toContainText(/killer/i);
    await expect(m.host.getByTestId(`vote-count-${hostId}`)).toContainText('4');

    for (const page of [m.host, m.guest]) {
      await expect(page.getByTestId('gameover')).toBeVisible({ timeout: gameOverWaitMs });
      await expect(page.getByTestId('gameover-winner')).toContainText(/village/i);
      await allRolesShown(m, page);
    }
    // The room returns to the lobby with the same code.
    await expect(m.host.getByTestId('party-code')).toHaveText(m.code, { timeout: lobbyWaitMs });
    await expect(m.guest.getByTestId('party-code')).toHaveText(m.code);
    await expect(m.host.getByTestId('player-count')).toHaveText('5 / 10');
  } finally {
    await m.close();
  }
});

test('a 4-seat match: the Killer takes a bot, the humans eject the other bot, Cabal wins', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const m = await startMatch(browser, 2, 'skip');
  try {
    // Bot1 stands on square_2 and Bot2 on square_3; the host (square_0) walks past the guest to Bot1.
    await killAndReport(m, 'Bot1');
    const bot2 = m.ids().get('Bot2')!;
    await m.host.getByTestId(`portrait-${bot2}`).click();
    await m.guest.getByTestId(`portrait-${bot2}`).click();
    await expect(m.host.getByTestId('stamp')).toBeVisible();
    await expect(m.host.getByTestId(`vote-count-${bot2}`)).toContainText('2');
    for (const page of [m.host, m.guest]) {
      await expect(page.getByTestId('gameover')).toBeVisible({ timeout: gameOverWaitMs });
      await expect(page.getByTestId('gameover-winner')).toContainText(/cabal/i);
      await allRolesShown(m, page);
    }
  } finally {
    await m.close();
  }
});
