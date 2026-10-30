import { quests, routines } from '@wdi/content';
import { expect, test, type Page } from '@playwright/test';

// Round 10, 10Y (DECISIONS A314): the Studio NPC editor's save, end to end from the panel. On `?mock=1` the Studio
// runs on the in-memory room and `mockSaveApi` answers a made-up draft PR while keeping every request on
// `window.__wdiStudio.saves`. The specs make the edit the server's own route test makes (`studioSaveFiles.test.ts`,
// "the clerk walks the pump first") and check that the panel sends that very body: the whole file in its key order,
// one row changed, the note beside it. The server test proves that body commits and opens the draft PR. The first spec
// writes `studio-npc-1280x720.png` to its output dir; `docs/ui` keeps a copy (UI.md 12).

interface SaveRequest {
  file: string;
  json: unknown;
  note?: string;
}

const saves = (page: Page) =>
  page.evaluate(() => (window as unknown as { __wdiStudio: { saves: SaveRequest[] } }).__wdiStudio.saves);

async function openNpc(page: Page) {
  await page.goto('/Who-Did-It/?mock=1#/studio');
  // The NPC mode opens on the room's first snapshot; the status line carries the tick once it is in.
  await expect(page.getByTestId('studio-status')).toContainText('tick');
  await page.getByTestId('studio-mode-npc').click();
  await expect(page.getByTestId('studio-npc-panel')).toBeVisible();
}

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1280, height: 720 }));

test('the clerk walks the pump first: Save sends the whole routines file with that one change and the note', async ({
  page,
}, info) => {
  await openNpc(page);
  await page.getByTestId('studio-npc-figure').selectOption('clerk');
  // The pump is the clerk's fourth station (`routines.json`); three moves up put it first.
  await expect(page.getByTestId('studio-npc-station-3')).toContainText('pump');
  for (const i of [3, 2, 1]) await page.getByTestId(`studio-npc-up-${i}`).click();
  await expect(page.getByTestId('studio-npc-station-0')).toContainText('pump');
  await page.getByTestId('studio-npc-note').fill('Pump first.');
  await page.getByTestId('studio-npc-save').click();
  await expect(page.getByTestId('studio-npc-out')).toHaveText('Draft PR #0 opened on studio/mock');
  await expect(page.getByTestId('studio-npc-problems')).toBeEmpty();

  const clerk = routines.townsfolk.clerk!;
  const edited = {
    ...routines,
    townsfolk: {
      ...routines.townsfolk,
      clerk: { ...clerk, stations: ['pump', 'ledger', 'noticeBoard', 'window'] },
    },
  };
  expect(await saves(page)).toEqual([{ file: 'routines.json', json: edited, note: 'Pump first.' }]);
  await page.screenshot({ path: info.outputPath('studio-npc-1280x720.png'), animations: 'disabled' });
});

test('a renamed quest NPC: Save people sends quests.json alone, under the same note', async ({ page }) => {
  await openNpc(page);
  await page.getByTestId('studio-npc-pick').selectOption('smith');
  await page.getByTestId('studio-npc-name').fill('Old Smith');
  await page.getByTestId('studio-npc-name').press('Tab');
  await page.getByTestId('studio-npc-note').fill('A new name over the forge.');
  await page.getByTestId('studio-people-save').click();
  await expect(page.getByTestId('studio-people-out')).toHaveText('1 draft PRs opened');
  await expect(page.getByTestId('studio-people-problems')).toBeEmpty();

  const smith = quests.npcs.smith!;
  const edited = { ...quests, npcs: { ...quests.npcs, smith: { ...smith, name: 'Old Smith' } } };
  expect(await saves(page)).toEqual([
    { file: 'quests.json', json: edited, note: 'A new name over the forge.' },
  ]);
});
