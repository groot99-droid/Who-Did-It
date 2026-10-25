import { describe, expect, it } from 'vitest';
import { scenes, type Scene } from '@wdi/content';
import { lacksTurnArt } from './artOf';
import { placeAny, rotate } from './blockEdit';
import { checkScene } from './checks';
import { find } from './sceneEdit';
import { EditorSession } from './session';

const base = scenes.overworld as Scene;
const ok = (e: { scene: Scene } | { error: string }): Scene => {
  if ('error' in e) throw new Error(e.error);
  return e.scene;
};
const newErrors = (s: Scene, from: Scene) =>
  checkScene(s).errors.filter((e) => !checkScene(from).errors.includes(e));
/** A scene with a 3x2 shed on open floor, found by scanning. */
function withShed(): { scene: Scene; at: { x: number; y: number } } {
  const t = { art: 'manor', footprint: { x: 0, y: 0, w: 3, h: 2 } };
  for (let y = 0; y < base.size.h; y++)
    for (let x = 0; x < base.size.w; x++) {
      const r = placeAny(base, 'buildings', 'bld_shed', x, y, t);
      if (!('error' in r) && !('error' in rotate(r.scene, { kind: 'buildings', id: 'ov.bld_shed' })))
        return { scene: r.scene, at: { x, y } };
    }
  throw new Error('no room for a shed');
}

describe('rotating', () => {
  const shed = { kind: 'buildings', id: 'ov.bld_shed' } as const;

  it('turns a spawn and a giver two facings, and a full circle returns', () => {
    const sp = { kind: 'spawns', id: base.spawns[0]!.id } as const;
    let s = base;
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      s = ok(rotate(s, sp));
      seen.push(find(s, sp)!.id && (find(s, sp) as unknown as { facing: string }).facing);
    }
    expect(new Set(seen).size).toBe(4);
    expect(seen[3]).toBe((base.spawns[0] as { facing: string }).facing);
  });

  it('cycles a prop through 90, 180, 270 and drops `rot` at a full turn', () => {
    const pick = { kind: 'props', id: base.props.find((p) => p.footprint === undefined)!.id } as const;
    const rots: Array<number | undefined> = [];
    let s = base;
    for (let i = 0; i < 4; i++) {
      s = ok(rotate(s, pick));
      rots.push((find(s, pick) as unknown as { rot?: number }).rot);
    }
    expect(rots).toEqual([90, 180, 270, undefined]);
    expect(find(s, pick)).not.toHaveProperty('rot');
  });

  it('swaps a building footprint at its corner on a 90 turn, with the grid and material', () => {
    const { scene, at } = withShed();
    const turned = ok(rotate(scene, shed));
    const b = turned.buildings!.find((e) => e.id === shed.id)!;
    expect(b).toMatchObject({ rot: 90, footprint: { x: at.x, y: at.y, w: 2, h: 3 } });
    expect(turned.grid[at.y + 2]!.slice(at.x, at.x + 2)).toBe('##');
    expect(scene.grid[at.y]![at.x + 2]).toBe('#');
    expect(turned.grid[at.y]![at.x + 2]).toBe('.');
    expect(newErrors(turned, scene)).toEqual([]);
    const back = ok(rotate(ok(rotate(ok(rotate(turned, shed)), shed)), shed));
    expect(back.buildings!.find((e) => e.id === shed.id)).toMatchObject({ footprint: { w: 3, h: 2 } });
    expect(back.buildings!.find((e) => e.id === shed.id)).not.toHaveProperty('rot');
  });

  it('refuses a 90 turn while a door stands in the building', () => {
    const manor = { kind: 'buildings', id: 'ov.bld_manor' } as const;
    expect(rotate(base, manor)).toEqual({
      error: 'ov.manor_front is a door of ov.bld_manor; move it before turning',
    });
  });

  it('transposes the plates of a multi-tile prop with it', () => {
    const s = scenes.bakery as Scene;
    const table = { kind: 'props', id: 'bk.wake_table' } as const;
    const r = rotate(s, table);
    if ('error' in r) return expect(r.error).toMatch(/clear|overlap|wall|leave/);
    const fp = find(s, table) as unknown as { footprint: { x: number; y: number } };
    const plate = find(s, { kind: 'props', id: 'bk.plate_6' })!;
    const turned = find(r.scene, { kind: 'props', id: 'bk.plate_6' })!;
    expect(turned).toMatchObject({
      x: fp.footprint.x + (plate.y - fp.footprint.y),
      y: fp.footprint.y + (plate.x - fp.footprint.x),
    });
  });

  it('refuses a kind that does not turn', () => {
    expect(rotate(base, { kind: 'lights', id: base.lights![0]!.id })).toHaveProperty('error');
  });

  it('turns the selection through the session and undoes it', () => {
    const s = new EditorSession('overworld');
    const pick = { kind: 'spawns', id: s.scene.spawns[0]!.id } as const;
    const before = (find(s.scene, pick) as unknown as { facing: string }).facing;
    s.select(pick);
    s.rotateSelected();
    expect((find(s.scene, pick) as unknown as { facing: string }).facing).not.toBe(before);
    s.undo();
    expect((find(s.scene, pick) as unknown as { facing: string }).facing).toBe(before);
  });
});

describe('the "no art for this angle" badge', () => {
  it('shows for a turned building without an `@r90` frame and goes with the frame', () => {
    const { scene } = withShedTurned();
    const pick = { kind: 'buildings', id: 'ov.bld_shed' } as const;
    expect(lacksTurnArt(scene, pick, () => false)).toBe(true);
    expect(lacksTurnArt(scene, pick, (a, f) => a === 'bld_hollowmere' && f === 'manor@r90#0_0')).toBe(false);
    expect(lacksTurnArt(base, { kind: 'buildings', id: 'ov.bld_manor' }, () => false)).toBe(false);
  });
});

function withShedTurned() {
  const { scene, at } = withShed();
  return { scene: ok(rotate(scene, { kind: 'buildings', id: 'ov.bld_shed' })), at };
}
