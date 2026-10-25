import { describe, expect, it } from 'vitest';
import { scenes, type Scene } from '@wdi/content';
import { diffScene } from './diffScene';
import { EditHistory } from './history';
import { pickAt } from './pick';
import { needlesOf, portalsTo, referencesTo } from './references';
import { duplicate, find, move, pairedPortal, patch, place, remove } from './sceneEdit';

const base = scenes.bakery as Scene;
const ok = (e: { scene: Scene } | { error: string }): Scene => {
  if ('error' in e) throw new Error(e.error);
  return e.scene;
};

describe('move', () => {
  it('moves a light and keeps the original untouched', () => {
    const next = ok(move(base, { kind: 'lights', id: 'bk.lt_lamp_table' }, 6, 6));
    expect(find(next, { kind: 'lights', id: 'bk.lt_lamp_table' })).toMatchObject({ x: 6, y: 6 });
    expect(find(base, { kind: 'lights', id: 'bk.lt_lamp_table' })).toMatchObject({ x: 5, y: 5 });
  });

  it('carries a prop footprint with it and refuses one that would leave the scene', () => {
    const pick = { kind: 'props', id: 'bk.wake_table' } as const;
    const next = ok(move(base, pick, 9, 5));
    expect(find(next, pick)).toMatchObject({ x: 9, y: 5, footprint: { x: 7, y: 5, w: 5, h: 2 } });
    expect(move(base, pick, 17, 4)).toHaveProperty('error');
    expect(move(base, pick, -1, 4)).toHaveProperty('error');
  });

  it('refuses an unknown id', () => {
    expect(move(base, { kind: 'props', id: 'bk.nope' }, 1, 1)).toHaveProperty('error');
  });
});

describe('place, duplicate, remove', () => {
  const light = { kind: 'lamp', radiusTiles: 2 };

  it('gives a new object the scene prefix, and a spawn its plain name', () => {
    const next = ok(place(base, 'lights', 'extra', 2, 2, light));
    expect(find(next, { kind: 'lights', id: 'bk.extra' })).toMatchObject({ x: 2, y: 2, radiusTiles: 2 });
    const sp = ok(place(base, 'spawns', 'side_door', 2, 2, { z: 0, facing: 's' }));
    expect(find(sp, { kind: 'spawns', id: 'side_door' })).toBeDefined();
  });

  it('refuses a bad name, a taken id and a tile outside', () => {
    expect(place(base, 'lights', 'Bad Name', 2, 2, light)).toHaveProperty('error');
    expect(place(base, 'lights', 'lt_lamp_table', 2, 2, light)).toHaveProperty('error');
    expect(place(base, 'lights', 'x', 99, 2, light)).toHaveProperty('error');
  });

  it('duplicates under a new name and anchors a copied footprint at the copy', () => {
    const next = ok(duplicate(base, { kind: 'props', id: 'bk.wake_table' }, 'wake_table_2'));
    expect(find(next, { kind: 'props', id: 'bk.wake_table_2' })).toMatchObject({
      x: 9,
      footprint: { x: 9, w: 5 },
    });
  });

  it('deletes a new id freely but refuses a frozen id that is named elsewhere', () => {
    const added = ok(place(base, 'lights', 'extra', 2, 2, light));
    const pick = { kind: 'lights', id: 'bk.extra' } as const;
    expect(ok(remove(added, pick, base, ['clues.x']))).not.toHaveProperty('lights.4');
    const frozen = { kind: 'portals', id: 'bk.door' } as const;
    const refused = remove(base, frozen, base, ['scenes.overworld.portals[3].toSpawn']);
    expect(refused).toMatchObject({ error: expect.stringContaining('overworld.portals[3]') });
    expect(remove(base, frozen, base, [])).toHaveProperty('scene');
  });
});

describe('patch', () => {
  it('sets plain fields and refuses an id or tile change', () => {
    const pick = { kind: 'lights', id: 'bk.lt_lamp_table' } as const;
    expect(find(ok(patch(base, pick, { radiusTiles: 4 })), pick)).toMatchObject({ radiusTiles: 4 });
    expect(patch(base, pick, { id: 'bk.other' })).toHaveProperty('error');
    expect(patch(base, pick, { x: 3 })).toHaveProperty('error');
  });
});

describe('pairedPortal', () => {
  it('finds the door on the other side', () => {
    const door = base.portals.find((p) => p.id === 'bk.door')!;
    const other = pairedPortal(door, scenes as unknown as Record<string, Scene>);
    expect(other?.to).toBe('bakery');
  });
});

describe('history', () => {
  it('undoes and redoes, and a new edit ends the redo chain', () => {
    const h = new EditHistory(0);
    h.push(1);
    h.push(2);
    h.undo();
    expect(h.current).toBe(1);
    expect(h.canRedo).toBe(true);
    h.redo();
    expect(h.current).toBe(2);
    h.undo();
    h.push(9);
    expect(h.canRedo).toBe(false);
    h.undo();
    h.undo();
    h.undo();
    expect(h.current).toBe(0);
    expect(h.canUndo).toBe(false);
  });
});

describe('diff', () => {
  it('lists nothing for an unchanged scene', () => {
    expect(diffScene(base, base)).toEqual([]);
  });

  it('lists added, moved and removed objects', () => {
    let s = ok(place(base, 'lights', 'extra', 2, 2, { kind: 'lamp', radiusTiles: 2 }));
    s = ok(move(s, { kind: 'lights', id: 'bk.lt_lamp_table' }, 6, 6));
    s = ok(remove(s, { kind: 'spots', id: 'bk.behind_counter' }, base, []));
    expect(diffScene(base, s)).toEqual([
      '- spots bk.behind_counter',
      '~ lights bk.lt_lamp_table x 5 -> 6, y 5 -> 6',
      '+ lights bk.extra at 2,2',
    ]);
  });
});

describe('pickAt', () => {
  it('picks a single tile object before the footprint prop under it, and a footprint anywhere on it', () => {
    expect(pickAt(base, 15, 1)).toEqual({ kind: 'spots', id: 'bk.behind_counter' });
    expect(pickAt(base, 10, 5)).toEqual({ kind: 'props', id: 'bk.wake_table' });
    expect(pickAt(base, 0, 0)).toBeNull();
  });
});

describe('references', () => {
  it('finds whole-string matches by path and uses the qualified form for a spawn', () => {
    expect(referencesTo(['a.b'], { f: { x: ['a.b', 'a.bc'], y: { z: 'a.b' } } })).toEqual([
      'f.x[0]',
      'f.y.z',
    ]);
    expect(needlesOf('bakery', 'spawns', 'door')).toEqual(['bakery.door']);
    expect(needlesOf('bakery', 'props', 'bk.x')).toEqual(['bk.x']);
  });

  it('finds the portals that land on a spawn, across scenes', () => {
    const hits = portalsTo('bakery', 'door', scenes as never);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.startsWith('overworld.'))).toBe(true);
    expect(portalsTo('bakery', 'no_such_spawn', scenes as never)).toEqual([]);
  });
});
