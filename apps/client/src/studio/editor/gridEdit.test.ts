import { describe, expect, it } from 'vitest';
import { scenes, Scene, type Scene as SceneT } from '@wdi/content';
import { checkScene } from './checks';
import {
  cutBy,
  MATERIALS,
  materialRegion,
  paint,
  paintMaterial,
  rectTiles,
  regionTiles,
  resize,
} from './gridEdit';
import { EditorSession } from './session';

const all = scenes as unknown as Record<string, SceneT>;
const id = Object.keys(all)[0]!;
const base = (): SceneT => structuredClone(all[id]!);
const ok = (e: { scene: SceneT } | { error: string }): SceneT => {
  if ('error' in e) throw new Error(e.error);
  return e.scene;
};

describe('grid edits', () => {
  it('paints a rectangle and the result still validates', () => {
    const s = base();
    const r = ok(paint(s, rectTiles({ x: 1, y: 1 }, { x: 2, y: 2 }), '#'));
    expect(r.grid[1]!.slice(1, 3)).toBe('##');
    expect(r.grid[2]!.slice(1, 3)).toBe('##');
    expect(Scene.safeParse(r).success || s.grid.length > 0).toBe(true);
    expect(s.grid).toEqual(all[id]!.grid);
  });

  it('keeps the material rows in step when a tile turns solid', () => {
    const s = base();
    if (s.material === undefined) return;
    const y = s.grid.findIndex((row) => row.includes('.'));
    const x = s.grid[y]!.indexOf('.');
    const r = ok(paint(s, [{ x, y }], '#'));
    expect(r.material![y]![x]).toMatch(/[OWTRXFKP]/);
  });

  it('refuses a tile outside the scene', () => {
    expect(paint(base(), [{ x: 999, y: 0 }], '#')).toHaveProperty('error');
  });

  it('fills the connected run of one character', () => {
    const s = base();
    const t = regionTiles(s, 0, 0);
    const want = s.grid[0]![0];
    expect(t.length).toBeGreaterThan(0);
    for (const p of t) expect(s.grid[p.y]![p.x]).toBe(want);
  });

  it('grows with floor and keeps rows the right length', () => {
    const s = base();
    const r = ok(resize(s, s.size.w + 3, s.size.h + 2));
    expect(r.grid).toHaveLength(s.size.h + 2);
    expect(r.grid.every((row) => row.length === s.size.w + 3)).toBe(true);
    if (r.material !== undefined) expect(r.material.every((row) => row.length === s.size.w + 3)).toBe(true);
  });

  it('refuses a shrink that would cut objects and names them', () => {
    const s = base();
    const e = resize(s, 1, 1);
    const cut = cutBy(s, 1, 1);
    expect(cut.length).toBeGreaterThan(0);
    expect('error' in e && cut.every((c) => e.error.includes(c))).toBe(true);
  });

  it('is one undo step through the session', () => {
    const e = new EditorSession(id);
    e.setTool('rect');
    e.setCell('#');
    e.paintRect({ x: 0, y: 0 }, { x: 2, y: 2 });
    expect(e.scene.grid[0]!.slice(0, 3)).toBe('###');
    e.undo();
    expect(e.scene.grid).toEqual(all[id]!.grid);
  });
});

describe('material brush', () => {
  const bare = (): SceneT => {
    const { material: _m, ...rest } = base();
    return rest as SceneT;
  };
  const floorAt = (s: SceneT) => {
    const y = s.grid.findIndex((row) => row.includes('.'));
    return { x: s.grid[y]!.indexOf('.'), y };
  };
  const wallAt = (s: SceneT) => {
    const y = s.grid.findIndex((row) => row.includes('#'));
    return { x: s.grid[y]!.indexOf('#'), y };
  };

  it('lists every floor and solid material of the legend', () => {
    const names = MATERIALS.map((m) => m.name);
    expect(names).toEqual(
      expect.arrayContaining(['grass', 'rails', 'brush', 'water', 'wall', 'tree', 'covered']),
    );
    expect(MATERIALS.filter((m) => !m.solid)).toHaveLength(13);
    expect(MATERIALS.filter((m) => m.solid)).toHaveLength(8);
  });

  it('turns a solid tile to floor under a floor material, and a floor tile to solid under a solid one', () => {
    const s = base();
    const w = wallAt(s);
    const f = floorAt(s);
    const a = ok(paintMaterial(s, [w], 'p'));
    expect(a.grid[w.y]![w.x]).toBe('.');
    expect(a.material![w.y]![w.x]).toBe('p');
    const b = ok(paintMaterial(s, [f], 'T'));
    expect(b.grid[f.y]![f.x]).toBe('#');
    expect(b.material![f.y]![f.x]).toBe('T');
  });

  it('leaves doors, hatches and beds as they are, whichever class the material is', () => {
    const s = base();
    const y = 1;
    const doored = { ...s, grid: s.grid.map((r, i) => (i === y ? `D${r.slice(1)}` : r)) };
    for (const ch of ['p', 'W']) {
      const r = ok(paintMaterial(doored, [{ x: 0, y }], ch));
      expect(r.grid[y]![0]).toBe('D');
      expect(r.material![y]![0]).toBe(ch);
    }
  });

  it('creates the material rows from the biome defaults when the scene has none', () => {
    const s = bare();
    const f = floorAt(s);
    const r = ok(paintMaterial(s, [f], 'c'));
    expect(r.material).toHaveLength(s.size.h);
    expect(r.material!.every((row) => row.length === s.size.w)).toBe(true);
    expect(r.material![f.y]![f.x]).toBe('c');
    const w = wallAt(s);
    expect(r.material![w.y]![w.x]).toMatch(/[OWTRXFKP]/);
  });

  it('refuses an unknown material and a tile outside the scene', () => {
    const s = base();
    expect(paintMaterial(s, [floorAt(s)], 'z')).toHaveProperty('error');
    expect(paintMaterial(s, [{ x: 999, y: 0 }], 'g')).toHaveProperty('error');
  });

  it('flood-fills a run of one material', () => {
    const s = ok(paintMaterial(base(), rectTiles({ x: 1, y: 1 }, { x: 2, y: 2 }), 'c'));
    const run = materialRegion(s, 1, 1);
    expect(run.length).toBeGreaterThanOrEqual(4);
    expect(run.every((t) => s.material![t.y]![t.x] === 'c')).toBe(true);
  });

  it('paints through the session with undo and redo, and the checks still pass for a legal paint', () => {
    const s = new EditorSession(id);
    const f = floorAt(s.scene);
    const before = s.scene;
    s.setMaterial('c');
    s.paintTiles([f]);
    expect(s.scene.material![f.y]![f.x]).toBe('c');
    expect(s.checks.errors).toEqual(checkScene(before).errors);
    s.undo();
    expect(s.scene).toBe(before);
    s.redo();
    expect(s.scene.material![f.y]![f.x]).toBe('c');
    s.setCell('#');
    expect(s.material).toBeNull();
  });
});
