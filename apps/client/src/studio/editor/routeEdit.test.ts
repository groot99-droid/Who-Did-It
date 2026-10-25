import { describe, expect, it } from 'vitest';
import { scenes, type Scene } from '@wdi/content';
import { diffScene } from './diffScene';
import { addGate, addPath, removeRoute, setGateProfile } from './routeEdit';
import { EditorSession } from './session';

const all = scenes as unknown as Record<string, Scene>;
const id = Object.keys(all).find((k) => all[k]!.grid.some((r) => r.includes('..')))!;
const base = (): Scene => structuredClone(all[id]!);
const ok = (e: { scene: Scene } | { error: string }): Scene => {
  if ('error' in e) throw new Error(e.error);
  return e.scene;
};
const floorPair = (s: Scene) => {
  const y = s.grid.findIndex((r) => r.includes('..'));
  return { a: { x: s.grid[y]!.indexOf('..'), y }, b: { x: s.grid[y]!.indexOf('..') + 1, y } };
};

describe('gates and paths', () => {
  it('adds a gate on floor under the scene prefix', () => {
    const s = base();
    const { a, b } = floorPair(s);
    const r = ok(addGate(s, 'new_gate', a, b, 'medium'));
    expect(r.gates.at(-1)).toMatchObject({ id: `${s.prefix}.new_gate`, w: 2, h: 1, minProfile: 'medium' });
  });

  it('refuses a gate over a wall, a bad name and a duplicate id', () => {
    const s = base();
    const wall = { x: s.grid[0]!.indexOf('#'), y: 0 };
    expect(addGate(s, 'g', wall, wall, 'small')).toHaveProperty('error');
    const { a } = floorPair(s);
    expect(addGate(s, 'Bad Name', a, a, 'small')).toHaveProperty('error');
    const first = ok(addGate(s, 'dup', a, a, 'small'));
    expect(addGate(first, 'dup', a, a, 'small')).toHaveProperty('error');
  });

  it('accepts a closed orthogonal loop and refuses a diagonal one', () => {
    const s = base();
    const loop = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    expect(ok(addPath(s, 'loop', 'patrol', loop)).paths.at(-1)!.points).toEqual(loop);
    expect(addPath(s, 'bad', 'patrol', [...loop.slice(0, 3), { x: 1, y: 3 }])).toHaveProperty('error');
    expect(addPath(s, 'few', 'patrol', loop.slice(0, 3))).toHaveProperty('error');
  });

  it('removes only what the committed scene did not have', () => {
    const s = base();
    const { a } = floorPair(s);
    const added = ok(addGate(s, 'tmp', a, a, 'small'));
    expect(ok(removeRoute(added, `${s.prefix}.tmp`, s)).gates).toHaveLength(s.gates.length);
    const frozen = [...s.gates, ...s.paths][0];
    if (frozen !== undefined) expect(removeRoute(s, frozen.id, s)).toHaveProperty('error');
  });

  it('changes a gate profile and lists every kind of change in the diff', () => {
    const s = base();
    const { a } = floorPair(s);
    let cur = ok(addGate(s, 'tmp', a, a, 'small'));
    cur = ok(setGateProfile(cur, `${s.prefix}.tmp`, 'large'));
    expect(cur.gates.at(-1)!.minProfile).toBe('large');
    expect(diffScene(s, cur)).toContain(`+ gates ${s.prefix}.tmp`);
    expect(diffScene(s, { ...cur, size: { w: s.size.w, h: s.size.h } })).not.toContain('~ size');
  });

  it('draws a path from clicked corners in one undo step', () => {
    const e = new EditorSession(id);
    e.setTool('path');
    for (const [x, y] of [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ] as const)
      e.click(x, y);
    expect(e.draft).toHaveLength(4);
    e.setName('walk');
    e.finishPath();
    expect(e.scene.paths.at(-1)!.id).toBe(`${e.scene.prefix}.walk`);
    expect(e.draft).toHaveLength(0);
    e.undo();
    expect(e.scene.paths).toHaveLength(all[id]!.paths.length);
  });
});
