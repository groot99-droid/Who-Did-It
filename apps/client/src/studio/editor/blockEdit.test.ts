import { describe, expect, it } from 'vitest';
import { scenes, type Scene } from '@wdi/content';
import { staticsOfScene } from './artOf';
import { duplicateAny, moveAny, placeAny, removeAny } from './blockEdit';
import { checkScene } from './checks';
import { find, listOf } from './sceneEdit';
import { EditorSession } from './session';

const base = scenes.overworld as Scene;
const manor = { kind: 'buildings', id: 'ov.bld_manor' } as const;
const ok = (e: { scene: Scene } | { error: string }): Scene => {
  if ('error' in e) throw new Error(e.error);
  return e.scene;
};
/** The first tile the block can be dropped on, scanning the scene. */
function dropFor(scene: Scene, pick: typeof manor) {
  for (let y = 0; y < scene.size.h; y++)
    for (let x = 0; x < scene.size.w; x++)
      if ((x !== 3 || y !== 6) && !('error' in moveAny(scene, pick, x, y))) return { x, y };
  throw new Error('no free place');
}
const fpOf = (s: Scene, id: string) => s.buildings!.find((b) => b.id === id)!.footprint;
const errorsOf = (s: Scene) => checkScene(s).errors.filter((e) => !checkScene(base).errors.includes(e));

const inManor = (o: { x: number; y: number }) => {
  const f = fpOf(base, manor.id);
  return o.x >= f.x && o.y >= f.y && o.x < f.x + f.w && o.y < f.y + f.h;
};
const stripRiders = (s: Scene): Scene => ({
  ...s,
  portals: s.portals.filter((p) => !inManor(p)),
  spots: s.spots.filter((p) => !inManor(p)),
  lights: (s.lights ?? []).filter((p) => !inManor(p)),
  props: s.props.filter((p) => p.footprint !== undefined || !inManor(p)),
});

describe('buildings as editable objects', () => {
  it('lists a building with its footprint corner as its tile, and keeps x and y out of the scene', () => {
    expect(listOf(base, 'buildings').find((b) => b.id === manor.id)).toMatchObject({ x: 3, y: 6 });
    const next = ok(moveAny(base, manor, 3, 6));
    expect(Object.keys(next.buildings![0]!)).not.toContain('x');
  });

  it('moves the whole footprint with its grid, material, door portals and art slices', () => {
    const to = dropFor(base, manor);
    const next = ok(moveAny(base, manor, to.x, to.y));
    const fp = fpOf(next, manor.id);
    expect(fp).toMatchObject({ x: to.x, y: to.y, w: 13, h: 6 });
    expect(errorsOf(next)).toEqual([]);
    // the old tiles are open floor again, the new ones are the old block's cells
    const was = fpOf(base, manor.id);
    const doors = base.portals.filter((p) => inManor(p));
    expect(doors.length).toBeGreaterThan(0);
    for (const d of doors)
      expect(next.portals.find((p) => p.id === d.id)).toMatchObject({
        x: d.x + fp.x - was.x,
        y: d.y + fp.y - was.y,
      });
    expect(next.grid[fp.y]![fp.x]).toBe('#');
    const before = staticsOfScene(base, { hasFrame: () => true }).filter((d) =>
      d.id.startsWith('ov.bld_manor'),
    );
    const after = staticsOfScene(next, { hasFrame: () => true }).filter((d) =>
      d.id.startsWith('ov.bld_manor'),
    );
    expect(after).toHaveLength(before.length);
    expect(after.map((d) => d.x)).not.toEqual(before.map((d) => d.x));
  });

  it('refuses a drop on walls, doors or another building, and one that leaves the scene', () => {
    const bakery = find(base, { kind: 'buildings', id: 'ov.bld_bakery' })!;
    expect(moveAny(base, manor, bakery.x, bakery.y)).toHaveProperty('error');
    expect(moveAny(base, manor, base.size.w - 2, 0)).toHaveProperty('error');
    expect(moveAny(base, manor, -1, 0)).toHaveProperty('error');
  });

  it('deletes a building back to floor, refusing while a door still stands in it', () => {
    expect(removeAny(base, manor, base, [])).toHaveProperty('error');
    const bare = ok(removeAny(stripRiders(base), manor, { ...base, buildings: [] }, []));
    expect(bare.buildings!.some((b) => b.id === manor.id)).toBe(false);
    const fp = fpOf(base, manor.id);
    expect(bare.grid[fp.y + 1]!.slice(fp.x, fp.x + fp.w)).toBe('.'.repeat(fp.w));
  });

  it('duplicates a building onto open floor under a new id, and refuses a bad name', () => {
    const copy = ok(duplicateAny(base, manor, 'bld_manor2'));
    expect(copy.buildings!.map((b) => b.id)).toContain('ov.bld_manor2');
    expect(errorsOf(copy)).toEqual([]);
    expect(duplicateAny(base, manor, 'Bad Name')).toHaveProperty('error');
  });

  it('places a new building from a template on open floor only', () => {
    const t = { art: 'manor', footprint: { x: 0, y: 0, w: 3, h: 2 } };
    let at = { x: 0, y: 0 };
    for (let y = 0; y < base.size.h; y++)
      for (let x = 0; x < base.size.w; x++)
        if (!('error' in placeAny(base, 'buildings', 'bld_shed', x, y, t)) && at.x === 0 && at.y === 0)
          at = { x, y };
    const made = ok(placeAny(base, 'buildings', 'bld_shed', at.x, at.y, t));
    expect(made.grid[at.y]!.slice(at.x, at.x + 3)).toBe('###');
    expect(errorsOf(made)).toEqual([]);
    expect(placeAny(base, 'buildings', 'bld_shed', 3, 6, t)).toHaveProperty('error');
  });

  it('moves a multi-tile prop with its cells and the plates on it, to a place where the checks stay clean', () => {
    const s = scenes.bakery as Scene;
    const prop = { kind: 'props', id: 'bk.wake_table' } as const;
    const o = find(s, prop)!;
    const clean = (t: Scene) => checkScene(t).errors.every((e) => checkScene(s).errors.includes(e));
    let moved: Scene | null = null;
    for (let y = 0; y < s.size.h && moved === null; y++)
      for (let x = 0; x < s.size.w && moved === null; x++) {
        const r = moveAny(s, prop, x, y);
        if (!('error' in r) && (x !== o.x || y !== o.y) && clean(r.scene)) moved = r.scene;
      }
    expect(moved).not.toBeNull();
    const dx = find(moved!, prop)!.x - o.x;
    const dy = find(moved!, prop)!.y - o.y;
    const plate = find(s, { kind: 'props', id: 'bk.plate_6' })!;
    expect(find(moved!, { kind: 'props', id: 'bk.plate_6' })).toMatchObject({
      x: plate.x + dx,
      y: plate.y + dy,
    });
  });

  it('works through the session with undo', () => {
    const s = new EditorSession('overworld');
    const to = dropFor(s.scene, manor);
    s.select(manor);
    s.moveSelected(to.x, to.y);
    expect(s.error).toBe('');
    expect(fpOf(s.scene, manor.id).x).toBe(to.x);
    s.undo();
    expect(fpOf(s.scene, manor.id).x).toBe(3);
  });
});
