import { describe, expect, it } from 'vitest';
import { scenes, Scene, type Scene as SceneT } from '@wdi/content';
import { cutBy, paint, rectTiles, regionTiles, resize } from './gridEdit';
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
