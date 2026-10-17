import { balance, onubRoles } from '@wdi/content';
import { TILE_PX } from '@wdi/shared';
import { expect, test, type Page } from '@playwright/test';
import { type Swarm, runSwarm } from '../../../tools/bots/swarm';
import { E2E_SERVER_URL } from './env';

// NPC fill (M3c, GDD 3.12) end to end against the real server. The host adds NPC seats in the lobby or
// lets Start fill the party; nothing on the page marks a seat as an NPC, so the specs read names from the
// player list and positions from a standing bot's state (never the server-only name pool). It needs the
// NPC server (S), the lobby (V) and the match flow, so it runs only with WDI_E2E_NPC=1; the quick-mode
// case is skipped until Session 5E rewrites it. The server runs with WDI_DEBUG=1 (playwright.config.ts).
test.skip(
  process.env.WDI_E2E_NPC !== '1',
  'needs the M3b/M3c sessions R, S, T, U and V merged (WDI_E2E_NPC=1)',
);

interface PlayerView {
  id: string;
  name: string;
  alive: boolean;
  presence?: { x: number; y: number };
}
interface StateView {
  players: { forEach(cb: (p: PlayerView) => void): void };
  scenes: { get(key: string): { bodies: { size: number } } | undefined };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const voteWindowMs = (balance.npc.vote.delayMaxS + 10) * 1000;

async function createParty(page: Page, query = ''): Promise<string> {
  await page.goto(`/Who-Did-It/${query}`);
  await page.getByLabel('Your name').fill('Hana');
  await page.getByRole('button', { name: 'Create Party' }).click();
  return ((await page.getByTestId('party-code').textContent()) ?? '').trim();
}

/** One entry per roster row of the lobby list, host first as the page shows them. */
async function rows(page: Page): Promise<string[]> {
  return (await page.getByTestId('player-list').locator('li').allTextContents()).map((t) => t.trim());
}

/** A standing bot that stays outside the count the page asserts: it joins after them. */
async function watcher(
  code: string,
): Promise<{ swarm: Swarm; view: () => StateView; id: (name: string) => string }> {
  const swarm = await runSwarm({ code, count: 1, url: E2E_SERVER_URL, walk: false, prefix: 'Watch' });
  const view = () => swarm.rooms[0]!.state as unknown as StateView;
  return {
    swarm,
    view,
    id: (name) => {
      let id = '';
      view().players.forEach((p) => {
        if (p.name === name) id = p.id;
      });
      return id;
    },
  };
}

const tilesBetween = (v: StateView, a: string, b: string): number => {
  const at = new Map<string, { x: number; y: number }>();
  v.players.forEach((p) => p.presence && at.set(p.name, p.presence));
  const pa = at.get(a);
  const pb = at.get(b);
  return pa && pb ? Math.hypot(pa.x - pb.x, pa.y - pb.y) / TILE_PX : Infinity;
};

/** Walk the host toward a named seat with the arrow keys of the axis that is farthest off, until in reach. */
async function approach(page: Page, v: () => StateView, target: string, ms = 20_000): Promise<void> {
  const pos = (name: string) => {
    let at: { x: number; y: number } | undefined;
    v().players.forEach((p) => {
      if (p.name === name) at = p.presence;
    });
    return at;
  };
  const held = new Set<string>();
  const press = async (key: string, on: boolean) => {
    if (on === held.has(key)) return;
    if (on) held.add(key);
    else held.delete(key);
    await (on ? page.keyboard.down(key) : page.keyboard.up(key));
  };
  try {
    for (const t0 = Date.now(); tilesBetween(v(), 'Hana', target) > 1.1 && Date.now() - t0 < ms;) {
      const a = pos('Hana');
      const b = pos(target);
      if (a && b) {
        await press('KeyD', b.x - a.x > TILE_PX * 0.4);
        await press('KeyA', a.x - b.x > TILE_PX * 0.4);
        await press('KeyS', b.y - a.y > TILE_PX * 0.4);
        await press('KeyW', a.y - b.y > TILE_PX * 0.4);
      }
      await sleep(30);
    }
  } finally {
    for (const k of [...held]) await page.keyboard.up(k);
  }
  expect(tilesBetween(v(), 'Hana', target) <= 1.1, `the host reached ${target}`).toBe(true);
}

test('three NPC seats added by hand: the host kills and reports, the NPCs vote in time, the match ends', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const page = await (await browser.newContext()).newPage();
  const code = await createParty(page);

  for (let i = 0; i < 3; i++) await page.getByTestId('add-npc').click();
  await expect(page.getByTestId('player-count')).toHaveText('4 / 10');
  // Four rows, four different texts, and only the host's is the host's name.
  const seen = await rows(page);
  expect(seen).toHaveLength(4);
  expect(new Set(seen).size, 'four distinct rows').toBe(4);
  expect(seen.filter((n) => n.includes('Hana'))).toHaveLength(1);

  // The watcher only supplies the debug channel and the first victim; it joins after the count above.
  const w = await watcher(code);
  try {
    await expect(page.getByTestId('player-count')).toHaveText('5 / 10');
    const hana = w.id('Hana');
    w.swarm.rooms[0]!.send('debug.deal', { roles: { [hana]: 'killer' } });
    await sleep(300);
    await page.getByTestId('start').click();
    await page.getByTestId('confirm-start').click();
    await expect(page.getByTestId('role-name')).toHaveText('Killer');
    await page.getByTestId('ready').click();
    await expect(page.getByTestId('hud-clock')).toBeVisible();
    // Park the NPCs on their spawns so the host can find them, and free the Knife.
    w.swarm.rooms[0]!.send('debug.npc', { walk: false });
    w.swarm.rooms[0]!.send('debug.clock', { phase: 'day', clearCooldowns: true });

    // First kill: the watcher. The host reports the body; three NPCs and the host are still alive.
    await approach(page, w.view, 'Watch1');
    await page.keyboard.press('KeyQ');
    await expect.poll(() => w.view().scenes.get('overworld')?.bodies.size ?? 0).toBe(1);
    await expect(page.getByTestId('prompt')).toContainText(/report/i);
    await page.keyboard.press('KeyE');
    await expect(page.getByTestId('meeting')).toBeVisible();

    // The host votes Skip; the meeting ends early only once all three NPCs have voted, so the reveal inside the
    // NPC vote window proves they did. NPCs without clues vote Skip, so nobody is stamped: read the reveal line.
    await page.getByTestId('vote-skip').click();
    await expect(page.getByTestId('reveal-role')).toBeVisible({ timeout: voteWindowMs });

    // The Killer finishes it: with the watcher gone, two more kills leave the Village at one (GDD 3.8).
    await expect(page.getByTestId('hud-clock')).toBeVisible({
      timeout: (balance.phases.revealS + 30) * 1000,
    });
    w.swarm.rooms[0]!.send('debug.clock', { phase: 'day', clearCooldowns: true });
    const alive = () => {
      const out: string[] = [];
      w.view().players.forEach(
        (p) => p.alive && p.name !== 'Hana' && p.name !== 'Watch1' && out.push(p.name),
      );
      return out;
    };
    // A kill stays secret until a meeting (the public `alive` flips when one opens), so each kill is counted
    // by the body it leaves, as the first one was.
    const bodies = () => w.view().scenes.get('overworld')?.bodies.size ?? 0;
    const downed = new Set<string>();
    for (let i = 0; i < 2; i++) {
      const prey = alive().find((n) => !downed.has(n))!;
      const before = bodies();
      await approach(page, w.view, prey);
      await page.keyboard.press('KeyQ');
      await expect.poll(bodies, { message: `kill ${i + 2} leaves a body` }).toBe(before + 1);
      downed.add(prey);
      w.swarm.rooms[0]!.send('debug.clock', { phase: 'day', clearCooldowns: true });
    }
    await expect(page.getByTestId('gameover')).toBeVisible({ timeout: (balance.phases.revealS + 30) * 1000 });
    await expect(page.getByTestId('gameover-winner')).toContainText(/cabal/i);
  } finally {
    await w.swarm.stop();
    await page.context().close();
  }
});

test('Start alone fills the party: four portraits in the meeting', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await (await browser.newContext()).newPage();
  const code = await createParty(page);
  // Hana plus the watcher make two seats; Start fills the other two with NPCs (the fill at Start).
  const w = await watcher(code);
  try {
    await expect(page.getByTestId('player-count')).toHaveText('2 / 10');
    w.swarm.rooms[0]!.send('debug.deal', { roles: { [w.id('Hana')]: 'killer' } });
    await sleep(300);
    await page.getByTestId('start').click();
    await page.getByTestId('confirm-start').click();
    await expect(page.getByTestId('role-name')).toHaveText('Killer');
    await page.getByTestId('ready').click();
    await expect(page.getByTestId('hud-clock')).toBeVisible();
    w.swarm.rooms[0]!.send('debug.npc', { walk: false });
    w.swarm.rooms[0]!.send('debug.clock', { phase: 'day', clearCooldowns: true });
    await approach(page, w.view, 'Watch1');
    await page.keyboard.press('KeyQ');
    await expect.poll(() => w.view().scenes.get('overworld')?.bodies.size ?? 0).toBe(1);
    await expect(page.getByTestId('prompt')).toContainText(/report/i);
    await page.keyboard.press('KeyE');
    await expect(page.getByTestId('meeting')).toBeVisible();
    await expect(page.locator('[data-testid^="portrait-"]')).toHaveCount(balance.players.min);
  } finally {
    await w.swarm.stop();
    await page.context().close();
  }
});

// Session 5E rewrites this case for ONUB v2 (round-5 contract section 9); the loft and the swap log are gone.
test.skip('quick mode, one human and three NPCs: the Conductor runs the night to the swap log', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const page = await (await browser.newContext()).newPage();
  // The live lobby offers the mode toggle only with ?onub=1.
  await createParty(page, '?onub=1');
  await page.getByTestId('mode-toggle').click();
  await expect(page.getByTestId('mode-chip')).toContainText(/One Night Ultimate Baguette/i);
  for (let i = 0; i < 3; i++) await page.getByTestId('add-npc').click();
  await expect(page.getByTestId('player-count')).toHaveText('4 / 10');

  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await expect(page.getByTestId('rolecard')).toContainText(onubRoles.cardLine);
  await page.getByTestId('ready').click();
  await expect(page.getByTestId('entered')).toContainText('bakery');
  // The humans sleep through the night whatever they hold; the NPCs wake and act inside the Conductor.
  await expect(page.getByTestId('loft')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('meeting')).toBeVisible({ timeout: 240_000 });
  await expect(page.getByTestId('vote-skip')).toBeHidden();
  await expect(page.locator('[data-testid^="portrait-"]')).toHaveCount(balance.players.min);

  // Vote for the first other seat; the NPCs vote in their delay window and the vote ends early.
  // Own portrait is refused, so click them in turn: whichever other seat is hit first carries the vote.
  const portraits = page.locator('[data-testid^="portrait-"]');
  for (let i = 0; i < balance.players.min; i++) {
    await portraits.nth(i).click();
    await sleep(300);
  }
  await expect(page.getByTestId('stamp')).toBeVisible({ timeout: voteWindowMs + 30_000 });
  await expect(page.getByTestId('gameover')).toBeVisible({ timeout: (balance.phases.revealS + 30) * 1000 });
  await expect(page.getByTestId('swaplog')).toBeVisible();
  await page.context().close();
});
