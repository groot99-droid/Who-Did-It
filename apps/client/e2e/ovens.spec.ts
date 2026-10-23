import { expect, test, type Page } from '@playwright/test';
import { createParty } from './fixtures/party';

// Round 7 (7K, A116, A118): Crumb's Ovens' four station rooms behind the bakery's back wall, walked against the
// ?mock=1 world feed. From the square to the bakery, then through each back-wall door into its room and out again.

async function toWorld(page: Page) {
  await page.goto('/Who-Did-It/?mock=1&fps=1&bots=still');
  await createParty(page, 'Hana');
  await expect(page.getByTestId('start')).toBeEnabled();
  await page.getByTestId('start').click();
  await page.getByTestId('confirm-start').click();
  await page.getByTestId('ready').click();
  await expect(page.getByTestId('hud-clock')).toBeVisible();
}

/** Keys that walk a world direction (SPRITES 10.8): the keyboard is screen-axis, turned 45 degrees into the world. */
const WORLD_KEYS = {
  north: ['KeyW', 'KeyD'],
  east: ['KeyS', 'KeyD'],
  south: ['KeyA', 'KeyS'],
  west: ['KeyA', 'KeyW'],
} as const;
type Dir = keyof typeof WORLD_KEYS;

/** Holds `keys` down together for `ms`, in one page call each way so the input timer never sees a single key. */
async function hold(page: Page, keys: readonly string[], ms: number) {
  const fire = (type: 'keydown' | 'keyup') =>
    page.evaluate(
      ([t, codes]) => {
        for (const code of codes)
          window.dispatchEvent(new KeyboardEvent(t, { code, bubbles: true, cancelable: true }));
      },
      [type, keys] as const,
    );
  await fire('keydown');
  await page.waitForTimeout(ms);
  await fire('keyup');
}

/** The own seat's scene and tile position, from the `?fps=1` panel. */
async function where(page: Page): Promise<{ scene: string; x: number; y: number }> {
  const text = (await page.getByTestId('hud-fps').textContent()) ?? '';
  const lines = text.split('\n');
  const at = /at (-?[\d.]+),(-?[\d.]+)/.exec(text);
  return { scene: lines[2] ?? '', x: Number(at?.[1] ?? NaN), y: Number(at?.[2] ?? NaN) };
}

/**
 * Walks one world axis at a time to the centre of tile (tx, ty), reading the position back after every burst; a burst
 * that gains nothing (a wall corner, a drift off the lane) turns the next one onto the other axis.
 */
async function walkTo(page: Page, tx: number, ty: number) {
  let alongX = true;
  let last = { x: NaN, y: NaN };
  for (let i = 0; i < 160; i++) {
    const { x, y } = await where(page);
    const dx = tx + 0.5 - x;
    const dy = ty + 0.5 - y;
    if (Math.abs(dx) <= 0.35 && Math.abs(dy) <= 0.35) return;
    if (Math.abs(x - last.x) < 0.05 && Math.abs(y - last.y) < 0.05) alongX = !alongX;
    else alongX = Math.abs(dx) > 0.35 && (alongX || Math.abs(dy) <= 0.35);
    last = { x, y };
    const d = alongX ? dx : dy;
    const dir: Dir = alongX ? (d > 0 ? 'east' : 'west') : d > 0 ? 'south' : 'north';
    await hold(page, WORLD_KEYS[dir], Math.abs(d) > 2 ? 300 : 90);
    await page.waitForTimeout(60);
  }
  throw new Error(`never reached ${tx},${ty}: at ${JSON.stringify(await where(page))}`);
}

/** Steps toward a door until the prompt offers it, then uses it and waits for the scene. */
async function useDoor(page: Page, dir: Dir, scene: string) {
  const prompt = page.getByTestId('prompt');
  for (let i = 0; i < 40; i++) {
    if ((await prompt.isVisible()) && ((await prompt.textContent()) ?? '').includes('Enter')) break;
    await hold(page, WORLD_KEYS[dir], 110);
    await page.waitForTimeout(70);
  }
  await expect(prompt).toContainText('Enter');
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('hud-fps')).toContainText(scene, { timeout: 5000 });
  await page.waitForTimeout(500);
}

/** Each room: its back-wall door's column in the bakery, and the way out from the room's own door spawn. */
const ROOMS: ReadonlyArray<{ id: string; doorX: number; out: Dir }> = [
  { id: 'crumb_oven', doorX: 5, out: 'south' },
  { id: 'crumb_mixing', doorX: 8, out: 'south' },
  { id: 'crumb_proofing', doorX: 11, out: 'south' },
  { id: 'crumb_cold', doorX: 14, out: 'east' },
];

test("walks from the square into Crumb's Ovens and through each of its four station rooms", async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await toWorld(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // The square's first spawn (25,17), south to the open lane, east under the bakery, north to its street door.
  await walkTo(page, 25, 22);
  await walkTo(page, 42, 22);
  await walkTo(page, 42, 20);
  await useDoor(page, 'north', 'bakery');
  await page.screenshot({ path: info.outputPath('bakery.png') });
  // The street door's spawn (8,9); west of the counter, up the west aisle to the row below the back-wall doors.
  await walkTo(page, 4, 9);
  await walkTo(page, 4, 2);
  for (const room of ROOMS) {
    await walkTo(page, room.doorX, 2);
    await walkTo(page, room.doorX, 1);
    await useDoor(page, 'north', room.id);
    await page.screenshot({ path: info.outputPath(`${room.id}.png`) });
    await useDoor(page, room.out, 'bakery');
    expect((await where(page)).scene).toBe('bakery');
    await walkTo(page, room.doorX, 2);
  }
  expect(errors).toEqual([]);
});
