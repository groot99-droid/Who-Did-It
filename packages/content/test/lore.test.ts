import { describe, expect, it } from 'vitest';
import { content, LORE_PLACEHOLDER, LoreFile, validateContent, type Content } from '../src/index.js';

// Round 8 (GDD 3.26; docs/round8/stations.md 5), 7M: the shelf reader's books, letters, ledgers and clippings.

function broken(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy).filter((e) => e.startsWith('lore.json'));
}

const volume = (id: string, kind: 'book' | 'letter' | 'ledger' | 'clipping', pages = [LORE_PLACEHOLDER]) => ({
  id,
  title: id,
  kind,
  pages,
  pageLines: pages.map(() => '1-1'),
});

const mapOf = (propId: string): string | undefined => {
  const scene = Object.values(content.scenes).find((s) => s.props.some((p) => p.id === propId));
  return Object.entries(content.maps).find(
    ([, m]) => scene && (m.scenes as readonly string[]).includes(scene.id),
  )?.[0];
};

describe('lore.json', () => {
  it('ships valid, with shelves on both maps and every kind of volume', () => {
    expect(broken(() => undefined)).toEqual([]);
    const shelves = Object.keys(content.lore.shelves);
    expect(new Set(shelves.map(mapOf))).toEqual(new Set(['hollowmere', 'blackpine']));
    const kinds = new Set(Object.values(content.lore.shelves).flatMap((s) => s.volumes.map((v) => v.kind)));
    expect([...kinds].sort()).toEqual(['book', 'clipping', 'ledger', 'letter']);
  });

  it('ships pages the reader shows whole, each quoted from its vault work', () => {
    // 8V filled the pages that read "fill later" (A200 round 1); the ids stayed.
    const volumes = Object.values(content.lore.shelves).flatMap((s) => s.volumes);
    for (const v of volumes) {
      expect(v.source, v.id).toBeDefined();
      expect(v.pages, v.id).not.toContain(LORE_PLACEHOLDER);
      expect(v.pageLines.length, v.id).toBe(v.pages.length);
    }
    const pages = Object.values(content.lore.shelves).flatMap((s) => s.volumes.flatMap((v) => v.pages));
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) expect(page.length).toBeLessThanOrEqual(content.balance.reader.pageMaxChars);
  });

  it('rejects a shelf on a prop no scene has, and a volume on two shelves', () => {
    const errors = broken((c) => {
      c.lore.shelves['ov.no_such_shelf'] = { title: 'Nowhere', volumes: [volume('nowhere', 'clipping')] };
      c.lore.shelves['ov.board']!.volumes.push(volume('crumbsDaybook', 'clipping'));
    });
    expect([...errors].sort()).toEqual([
      'lore.json ov.board: volume crumbsDaybook is also on bk.ledger',
      'lore.json ov.no_such_shelf: no scene has a prop ov.no_such_shelf',
    ]);
  });

  it("holds a shelf of books to the owner's 3 to 5 spines", () => {
    const { spinesMin, spinesMax } = content.balance.reader;
    expect([spinesMin, spinesMax]).toEqual([3, 5]);
    const errors = broken((c) => {
      c.lore.shelves['as.shelf']!.volumes = c.lore.shelves['as.shelf']!.volumes.slice(0, 2);
      const bunk = c.lore.shelves['bl.wall_shelf']!;
      for (let i = 0; i < 2; i++) bunk.volumes.push(volume(`extra${i}`, 'book'));
    });
    expect(errors).toContain('lore.json as.shelf: a shelf of books shows 3 to 5 spines, not 2');
    expect(errors).toContain('lore.json bl.wall_shelf: a shelf of books shows 3 to 5 spines, not 6');
  });

  it('unfolds a letter as one sheet and keeps every page short enough to read whole', () => {
    const max = content.balance.reader.pageMaxChars;
    const errors = broken((c) => {
      const letter = c.lore.shelves['wp.letter_box']!.volumes[0]!;
      [letter.pages, letter.pageLines] = [
        ['one', 'two'],
        ['1-1', '2-2'],
      ];
      const ledger = c.lore.shelves['bk.ledger']!.volumes[0]!;
      [ledger.pages, ledger.pageLines] = [['x'.repeat(max + 1)], ['1-1']];
    });
    expect([...errors].sort()).toEqual([
      'lore.json bk.ledger: crumbsDaybook page 1 is 601 characters, over 600',
      'lore.json wp.letter_box: letter oneShot unfolds as one sheet, not 2',
    ]);
  });

  it('requires one source line range per page, first line no later than the last', () => {
    const errors = broken((c) => {
      const clipping = c.lore.shelves['ov.board']!.volumes[0]!;
      clipping.pageLines = [...clipping.pageLines, '10-12'];
      const ledger = c.lore.shelves['bk.ledger']!.volumes[0]!;
      ledger.pageLines = ledger.pageLines.map(() => '9-5');
    });
    const clipping = content.lore.shelves['ov.board']!.volumes[0]!;
    const ledger = content.lore.shelves['bk.ledger']!.volumes[0]!;
    expect(errors).toContain(
      `lore.json ov.board: ${clipping.id} has ${clipping.pages.length} pages but ${clipping.pages.length + 1} line ranges`,
    );
    expect(errors).toContain('lore.json bk.ledger: crumbsDaybook page 1 range 9-5 ends before it starts');
    expect(errors).toHaveLength(1 + ledger.pages.length);
    for (const bad of ['', '12', '0-4', '4-', 'a-b', '3-4,7-9']) {
      const v = { ...volume('a', 'clipping'), pageLines: [bad] };
      const file = { gddRef: '3.26', shelves: { 'ov.board': { title: 'B', volumes: [v] } } };
      expect(LoreFile.safeParse(file).success, bad).toBe(false);
    }
    const none = { id: 'a', title: 'a', kind: 'clipping', pages: ['x'] };
    const file = { gddRef: '3.26', shelves: { 'ov.board': { title: 'B', volumes: [none] } } };
    expect(LoreFile.safeParse(file).success).toBe(false);
  });

  it('refuses an empty page, an unknown kind and a source outside the vault', () => {
    const shelf = (v: Record<string, unknown>) => ({
      gddRef: '3.26',
      shelves: { 'ov.board': { title: 'B', volumes: [v] } },
    });
    expect(LoreFile.safeParse(shelf(volume('a', 'clipping'))).success).toBe(true);
    expect(LoreFile.safeParse(shelf(volume('a', 'clipping', ['  ']))).success).toBe(false);
    expect(LoreFile.safeParse(shelf({ ...volume('a', 'clipping'), kind: 'scroll' })).success).toBe(false);
    expect(LoreFile.safeParse(shelf({ ...volume('a', 'book'), source: 'notes/elsewhere.md' })).success).toBe(
      false,
    );
    expect(
      LoreFile.safeParse(shelf({ ...volume('a', 'book'), source: 'creative-writing/vault/03_Stories/x.md' }))
        .success,
    ).toBe(true);
    expect(
      LoreFile.safeParse({ gddRef: '3.26', shelves: { Board: { title: 'B', volumes: [] } } }).success,
    ).toBe(false);
  });
});
