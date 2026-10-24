import { describe, expect, it } from 'vitest';
import minigames from '@wdi/content/data/minigames.json';
import { MINIGAME_COPY as C } from '../../ui/copy/minigames';
import type { MinigameKind } from '@wdi/shared/protocol';
import { DEFAULT_SKINS, pieceAt, skinOf } from './skin';

const rows = Object.values(minigames.minigames).map((m) => ({ ...m, kind: m.kind as MinigameKind }));

describe('station skins (7M PR 5, A151 (3))', () => {
  it('draws every row as its own station, no two rows the same', () => {
    const stations = rows.map((m) => skinOf(m.task, m.kind).station);
    expect(new Set(stations).size).toBe(rows.length);
    for (const m of rows) expect(skinOf(m.task, m.kind)).toEqual(m.skin);
  });

  it("falls back to the kind's own station for a board no row names", () => {
    expect(skinOf('noSuchTask', 'crates')).toBe(DEFAULT_SKINS.crates);
    // A row plays one kind; asking for another kind of its task is not that row.
    const fence = rows.find((m) => m.task === 'mendFence')!;
    expect(skinOf(fence.task, 'pour')).toBe(DEFAULT_SKINS.pour);
  });

  it('gives each step its piece, the last one repeating', () => {
    const dough = rows.find((m) => m.task === 'mixDough')!.skin;
    expect([0, 1, 2, 5].map((i) => pieceAt(dough, i))).toEqual(['flour', 'water', 'water', 'water']);
    expect(pieceAt(DEFAULT_SKINS.stoke, 3)).toBe('oak');
  });

  it('names the station and its piece in the hints, never a fixed noun', () => {
    expect(C['minigame.crates.hint']).toContain('{piece}');
    expect(C['minigame.crates.hint']).toContain('{station}');
    for (const id of [
      'minigame.crates.load',
      'minigame.slide.hint',
      'minigame.slide.next',
      'minigame.stoke.tap',
    ] as const)
      expect(C[id]).toContain('{piece}');
    for (const line of Object.values(C)) expect(line).not.toMatch(/crate|banneton|oak|cart/i);
  });
});
