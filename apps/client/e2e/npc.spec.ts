import { balance, onubBalance } from '@wdi/content';
import { TILE_PX } from '@wdi/shared';
import { expect, test, type Page } from '@playwright/test';
import { type Swarm, runSwarm } from '../../../tools/bots/swarm';
import { E2E_SERVER_URL } from './env';
import { skipOpening } from './helpers';

// NPC fill (M3c, GDD 3.12) end to end against the real server. The host adds NPC seats in the lobby or
// lets Start fill the party; nothing on the page marks a seat as an NPC, so the specs read names from the
// player list and positions from a standing bot's state (never the server-only name pool). It needs the
// NPC server (S), the lobby (V) and the match flow, so it runs only with WDI_E2E_NPC=1; the quick-mode
// case also needs ONUB v2 (WDI_E2E_ONUB=1). The server runs with WDI_DEBUG=1 (playwright.config.ts).
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
interface AvatarView {
  lookOf: string;
  x: number;
  y: number;
}
interface StateView {
  players: { forEach(cb: (p: PlayerView) => void): void };
  scenes: {
    get(key: string): { bodies: { size: number } } | undefined;
    forEach(cb: (scene: { avatars?: { forEach(cb: (a: AvatarView) => void): void } }) => void): void;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const voteWindowMs =
  (balance.npc.vote.windowFrac.max *
    (Math.max(...Object.values(balance.byCount).map((r) => r.discussionS)) + balance.phases.voteS) +
    10) *
  1000;

async function createParty(page: Page, query = ''): Promise<string> {
  await page.addInitScript("sessionStorage.setItem('wdi:introSeen', '1')"); // no opening cinematic (6Q)
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

/**
 * Where a named seat stands in the watcher's view. Since round 5 (5F) only the own `presence` is on the wire; every
 * other seat is an avatar of the watcher's scene, drawn as `lookOf` (nobody impersonates in these cases).
 */
function positionOf(v: StateView, name: string): { x: number; y: number } | undefined {
  let id = '';
  let own: { x: number; y: number } | undefined;
  v.players.forEach((p) => {
    if (p.name !== name) return;
    id = p.id;
    own = p.presence;
  });
  if (own) return own;
  let at: { x: number; y: number } | undefined;
  v.scenes.forEach((scene) =>
    scene.avatars?.forEach((a) => {
      if (a.lookOf === id) at = { x: a.x, y: a.y };
    }),
  );
  return at;
}

const tilesBetween = (v: StateView, a: string, b: string): number => {
  const pa = positionOf(v, a);
  const pb = positionOf(v, b);
  return pa && pb ? Math.hypot(pa.x - pb.x, pa.y - pb.y) / TILE_PX : Infinity;
};

// The keys are screen axes on the isometric view (world.spec.ts): each world direction is a pair of them.
const WORLD_KEYS = {
  north: ['KeyW', 'KeyD'],
  east: ['KeyS', 'KeyD'],
  south: ['KeyA', 'KeyS'],
  west: ['KeyA', 'KeyW'],
} as const;
const OPPOSITE: Record<string, string> = { KeyW: 'KeyS', KeyS: 'KeyW', KeyA: 'KeyD', KeyD: 'KeyA' };

/** Walk the host toward a named seat with the keys of each world axis that is off, until in reach. */
async function approach(page: Page, v: () => StateView, target: string, ms = 20_000): Promise<void> {
  const pos = (name: string) => positionOf(v(), name);
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
        const want = new Set<string>();
        const off = TILE_PX * 0.4;
        if (b.x - a.x > off) WORLD_KEYS.east.forEach((k) => want.add(k));
        if (a.x - b.x > off) WORLD_KEYS.west.forEach((k) => want.add(k));
        if (b.y - a.y > off) WORLD_KEYS.south.forEach((k) => want.add(k));
        if (a.y - b.y > off) WORLD_KEYS.north.forEach((k) => want.add(k));
        for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD'])
          await press(k, want.has(k) && !want.has(OPPOSITE[k]!));
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
    await skipOpening(page);
    await expect(page.getByTestId('hud-clock')).toBeVisible();
    // Park the NPCs on their spawns so the host can find them, and free the Knife; the Knife works from dusk to the
    // end of the night (balance.json `kill.phases`, GDD 3.2), so the clock goes to the night.
    w.swarm.rooms[0]!.send('debug.npc', { walk: false });
    w.swarm.rooms[0]!.send('debug.clock', { phase: 'night', clearCooldowns: true });

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
    w.swarm.rooms[0]!.send('debug.clock', { phase: 'night', clearCooldowns: true });
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
      w.swarm.rooms[0]!.send('debug.clock', { phase: 'night', clearCooldowns: true });
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
    await skipOpening(page);
    await expect(page.getByTestId('hud-clock')).toBeVisible();
    w.swarm.rooms[0]!.send('debug.npc', { walk: false });
    w.swarm.rooms[0]!.send('debug.clock', { phase: 'night', clearCooldowns: true });
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

// ONUB v2 with NPC seats (GDD 3.11 "NPC seats", bugs.md: a real NPC seat through a whole quick match). One
// human and three NPCs: the human commits at once, so the prep ends before its clock only if every NPC committed
// inside `npc.commitS`; the NPCs then claim in the Rush (`claimFrac`) and vote, and the match reaches game over.
// Nothing on a page marks a seat as an NPC. Elements are the frozen hooks of onub-contract.md section 7. Opt-in
// like the rest of this file, and it needs ONUB v2 whole, so it also waits for WDI_E2E_ONUB=1.
test('quick mode, one human and three NPCs: prep, claims and votes by the NPC brain to game over', async ({
  browser,
}) => {
  test.skip(process.env.WDI_E2E_ONUB !== '1', 'needs ONUB v2 (sessions 5A to 5D) merged (WDI_E2E_ONUB=1)');
  test.setTimeout(1_200_000);
  const { timers, npc } = onubBalance;
  const page = await (await browser.newContext()).newPage();
  // The live lobby offers the mode toggle only with ?onub=1.
  await createParty(page, '?onub=1');
  await page.getByTestId('mode-toggle').click();
  await expect(page.getByTestId('deck-editor')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByTestId('add-npc').click();
  await expect(page.getByTestId('player-count')).toHaveText('4 / 10');

  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await expect(page.getByTestId('rolecard')).toBeVisible();
  await page.getByTestId('ready').click();

  // Prep: the human works the Oven (the fastest mini-game) with the assist control and commits a good card.
  await expect(page.getByTestId('kitchen')).toBeVisible({ timeout: (timers.roleCardS + 10) * 1000 });
  const prepFrom = Date.now();
  await page.getByTestId('station-oven').click();
  await page.getByTestId('minigame-assist').click({ timeout: (timers.minigameAssistS + 10) * 1000 });
  const good = onubBalance.stations.find((s) => s.id === 'oven')!.good[0];
  await page.getByTestId(`card-${good}`).click();
  await page.getByTestId('prep-commit').click();
  await expect(page.getByTestId('prep-done')).toBeVisible();
  // Every NPC commits by `commitS.max`; the prep ends when the last one has, well before the 60 s clock.
  await expect(page.getByTestId('prep-board')).toBeVisible({ timeout: (npc.commitS.max + 10) * 1000 });
  expect((Date.now() - prepFrom) / 1000, 'prep ended before its clock ran out').toBeLessThan(timers.prepS);

  // The Rush: each NPC claims inside `claimFrac` of it, so three claims are on the board by the latest of them.
  await expect(page.getByTestId('meeting')).toBeVisible({ timeout: 300_000 });
  await expect(page.getByTestId('vote-skip')).toBeHidden();
  await expect(page.locator('[data-testid^="portrait-"]')).toHaveCount(balance.players.min);
  // Every portrait carries its `claimed-<id>` badge, hidden until that seat claims: count the shown ones.
  await expect(page.locator('[data-testid^="claimed-"]:visible')).toHaveCount(3, {
    timeout: (npc.claimFrac.max * timers.rushS + 15) * 1000,
  });

  // The human votes for the Pantry; the NPCs have voted by `voteFrac` of the Rush plus CRUST, so the reveal and
  // game over follow without anyone waiting on a silent seat.
  await page.getByTestId('vote-pantry').click();
  await expect(page.getByTestId('stamp').first()).toBeVisible({
    timeout: (timers.rushS + timers.voteS + 30) * 1000,
  });
  await expect(page.getByTestId('gameover')).toBeVisible({ timeout: (timers.revealS + 30) * 1000 });
  await expect(page.getByTestId('actlog')).toBeVisible();
  await page.context().close();
});
