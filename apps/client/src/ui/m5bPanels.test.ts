import { describe, expect, it } from 'vitest';
import { TILE_PX } from '@wdi/shared/constants';
import { recipeRows } from './Crafting';
import { itemList, itemName, stacksOf } from './Inventory';
import { nearest, promptFor } from './M5bLayer';
import { questRows } from './QuestLog';

describe('Inventory helpers', () => {
  it('drops empty slots and names items from the content', () => {
    expect(
      stacksOf([
        { defId: 'timber', qty: 2 },
        { defId: '', qty: 0 },
        { defId: 'resin', qty: 0 },
      ]),
    ).toEqual([{ defId: 'timber', qty: 2 }]);
    expect(itemName('tinOre')).toBe('Tin Ore');
    expect(itemName('nope')).toBe('nope');
    expect(
      itemList([
        { item: 'resin', qty: 2 },
        { item: 'timber', qty: 1 },
      ]),
    ).toBe('Pine Resin x2, Timber');
  });
});

describe('recipeRows', () => {
  it('lists every recipe and what the pockets still lack for it', () => {
    const rows = recipeRows([{ defId: 'tinOre', qty: 1 }]);
    const lantern = rows.find((r) => r.id === 'lantern')!;
    expect(lantern.station).toBe('oven');
    expect(lantern.missing).toEqual([{ item: 'resin', qty: 1 }]);
    const lockpicks = rows.find((r) => r.id === 'lockpicks')!;
    expect(lockpicks.missing).toEqual([]);
    expect(rows.map((r) => r.id).sort()).toEqual([
      'crowbar',
      'lantern',
      'lockpicks',
      'snare',
      'spade',
      'torch',
    ]);
  });
  it('counts a quantity across stacks and asks for the rest', () => {
    const rows = recipeRows([{ defId: 'timber', qty: 1 }]);
    expect(rows.find((r) => r.id === 'spade')!.missing).toEqual([
      { item: 'timber', qty: 1 },
      { item: 'stone', qty: 1 },
    ]);
  });
});

describe('questRows', () => {
  const inv = [
    { defId: 'resin', qty: 2 },
    { defId: 'timber', qty: 1 },
  ];
  it('offers the quests of a giver in reach, none out of reach, never a contract', () => {
    const rows = questRows([], inv, new Set(['harbourmaster']));
    expect(rows.map((r) => [r.id, r.state, r.near])).toEqual([['caulkTheSkiff', 'offer', true]]);
    expect(questRows([], inv, new Set())).toEqual([]);
  });
  it('shows a held quest wherever its giver stands, with the progress the pockets give', () => {
    const [row] = questRows([{ id: 'caulkTheSkiff', progress: 0, done: false }], inv, new Set());
    expect(row).toMatchObject({ state: 'taken', near: false, have: 3, total: 3 });
    const [done] = questRows([{ id: 'caulkTheSkiff', progress: 3, done: true }], [], new Set());
    expect(done).toMatchObject({ state: 'done', have: 3 });
  });
  it('does not offer a quest the seat already holds', () => {
    const rows = questRows([{ id: 'mollsHerbs', progress: 0, done: false }], [], new Set(['moll']));
    expect(rows.filter((r) => r.id === 'mollsHerbs')).toHaveLength(1);
    expect(rows.find((r) => r.id === 'mollsMushrooms')?.state).toBe('offer');
  });
});

describe('hold prompt targets', () => {
  it('picks the nearest thing in reach and ignores what is beyond it', () => {
    const a = { x: TILE_PX, y: 0 };
    const b = { x: 0.5 * TILE_PX, y: 0 };
    expect(nearest({ x: 0, y: 0 }, [a, b])).toBe(b);
    expect(nearest({ x: 0, y: 0 }, [{ x: 5 * TILE_PX, y: 0 }])).toBeNull();
  });
  it('asks for the tool a resource needs before it offers the gather', () => {
    const node = { kind: 'node', id: 'n', resource: 'tinOre', x: 0, y: 0 } as const;
    expect(promptFor(node, () => false)).toBe('Needs a Spade to gather Tin Ore');
    expect(promptFor(node, () => true)).toBe('Hold G: gather Tin Ore');
    expect(promptFor({ kind: 'giver', npc: 'moll', x: 0, y: 0 }, () => true)).toBe(
      'Press T: speak to Mother Moll',
    );
    expect(promptFor(null, () => true)).toBeNull();
  });
});
