import type { BalanceFile } from './schemas/balance.js';
import type { LoreFile } from './schemas/lore.js';
import type { Scene, SceneId } from './schemas/scene.js';

/**
 * Round 8 (GDD 3.26), 7M: every shelf of `lore.json` is a prop on a scene; volume ids are unique across the file; every page cites its source lines; a
 * shelf of books shows `reader.spinesMin` to `reader.spinesMax` spines; a letter is one sheet; no page is longer than
 * `reader.pageMaxChars`, so the reader shows it whole.
 */
export function checkLore(
  c: { lore: LoreFile; balance: BalanceFile; scenes: Record<SceneId, Scene> },
  err: (msg: string) => void,
): void {
  const { spinesMin, spinesMax, pageMaxChars } = c.balance.reader;
  const props = new Set(Object.values(c.scenes).flatMap((s) => s.props.map((p) => p.id)));
  const seen = new Map<string, string>();
  for (const [propId, shelf] of Object.entries(c.lore.shelves)) {
    const at = `lore.json ${propId}`;
    if (!props.has(propId)) err(`${at}: no scene has a prop ${propId}`);
    const books = shelf.volumes.filter((v) => v.kind === 'book').length;
    if (books > 0 && (books < spinesMin || books > spinesMax))
      err(`${at}: a shelf of books shows ${spinesMin} to ${spinesMax} spines, not ${books}`);
    for (const v of shelf.volumes) {
      const other = seen.get(v.id);
      if (other !== undefined) err(`${at}: volume ${v.id} is also on ${other}`);
      seen.set(v.id, propId);
      if (v.kind === 'letter' && v.pages.length !== 1)
        err(`${at}: letter ${v.id} unfolds as one sheet, not ${v.pages.length}`);
      if (v.pageLines.length !== v.pages.length)
        err(`${at}: ${v.id} has ${v.pages.length} pages but ${v.pageLines.length} line ranges`);
      v.pageLines.forEach((range, i) => {
        const [first, last] = range.split('-').map(Number) as [number, number];
        if (first > last) err(`${at}: ${v.id} page ${i + 1} range ${range} ends before it starts`);
      });
      v.pages.forEach((page, i) => {
        if (page.length > pageMaxChars)
          err(`${at}: ${v.id} page ${i + 1} is ${page.length} characters, over ${pageMaxChars}`);
      });
    }
  }
}
