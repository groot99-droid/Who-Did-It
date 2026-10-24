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

  it('ships pages the reader shows whole, placeholders until the codex is written', () => {
    // Owner (A200 round 1): every page reads "fill later" for now; 8V replaces pages in place and the ids stay.
    expect(content.lore.shelves['as.shelf']!.volumes[0]!.pages).toEqual([LORE_PLACEHOLDER]);
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
      c.lore.shelves['wp.letter_box']!.volumes[0]!.pages = ['one', 'two'];
      c.lore.shelves['bk.ledger']!.volumes[0]!.pages = ['x'.repeat(max + 1)];
    });
    expect([...errors].sort()).toEqual([
      'lore.json bk.ledger: crumbsDaybook page 1 is 601 characters, over 600',
      'lore.json wp.letter_box: letter oneShot unfolds as one sheet, not 2',
    ]);
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
