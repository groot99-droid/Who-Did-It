import { describe, expect, it } from 'vitest';
import { scenes, type Scene } from '@wdi/content';
import { moveAny, placeAny, removeAny, duplicateAny } from './blockEdit';
import { diffScene } from './diffScene';
import { pickAt } from './pick';
import { listOf } from './sceneEdit';
import { EditorSession } from './session';
import { templatesFor } from './templates';

const woods = scenes.bp_woods as Scene;
const ok = (e: { scene: Scene } | { error: string }): Scene => {
  if ('error' in e) throw new Error(e.error);
  return e.scene;
};
const floorTile = (s: Scene) => {
  for (let y = 0; y < s.size.h; y++) {
    const x = s.grid[y]!.indexOf('.');
    if (x >= 0 && !s.givers!.some((g) => g.x === x && g.y === y)) return { x, y };
  }
  throw new Error('no floor');
};

describe('givers, nodes, spawners, gates and paths as editable objects', () => {
  it('moves a giver, a node and a spawner to a tile', () => {
    const t = floorTile(woods);
    for (const [kind, list] of [
      ['givers', woods.givers!],
      ['nodes', woods.nodes!],
      ['spawners', woods.spawners!],
    ] as const) {
      const next = ok(moveAny(woods, { kind, id: list[0]!.id }, t.x, t.y));
      expect(listOf(next, kind).find((o) => o.id === list[0]!.id)).toMatchObject(t);
    }
    expect(moveAny(woods, { kind: 'givers', id: woods.givers![0]!.id }, -1, 0)).toHaveProperty('error');
  });

  it('lists a path by its first corner and keeps x and y out of the scene', () => {
    const path = woods.paths[0]!;
    expect(listOf(woods, 'paths')[0]).toMatchObject(path.points[0]!);
    const same = ok(moveAny(woods, { kind: 'paths', id: path.id }, path.points[0]!.x, path.points[0]!.y));
    expect(same.paths[0]).toEqual(path);
  });

  it('moves a path by the same step at every corner, and refuses a step that leaves the scene', () => {
    const path = woods.paths[0]!;
    const from = path.points[0]!;
    const next = ok(moveAny(woods, { kind: 'paths', id: path.id }, from.x + 1, from.y));
    expect(next.paths[0]!.points).toEqual(path.points.map((q) => ({ x: q.x + 1, y: q.y })));
    expect(moveAny(woods, { kind: 'paths', id: path.id }, woods.size.w, from.y)).toHaveProperty('error');
  });

  it('moves a gate onto floor only', () => {
    const y = woods.grid.findIndex((r) => r.includes('..'));
    const at = { x: woods.grid[y]!.indexOf('..'), y };
    const s: Scene = { ...woods, gates: [{ id: 'bw.gate_t', minProfile: 'medium', ...at, w: 1, h: 1 }] };
    const to = { x: at.x + 1, y: at.y };
    expect(s.grid[to.y]![to.x]).toBe('.');
    const moved = ok(moveAny(s, { kind: 'gates', id: 'bw.gate_t' }, to.x, to.y));
    expect(moved.gates[0]).toMatchObject({ ...to, w: 1, h: 1 });
    const wall = { x: s.grid[0]!.indexOf('#'), y: 0 };
    expect(moveAny(s, { kind: 'gates', id: 'bw.gate_t' }, wall.x, wall.y)).toHaveProperty('error');
    expect(diffScene(s, moved).join('\n')).toContain('bw.gate_t');
  });

  it('picks a giver, a gate and a path corner by their tiles', () => {
    const g = woods.givers![0]!;
    expect(pickAt(woods, g.x, g.y)).toEqual({ kind: 'givers', id: g.id });
    const q = woods.paths[0]!.points[0]!;
    expect(pickAt(woods, q.x, q.y)?.kind).not.toBeNull();
    const withGate: Scene = {
      ...woods,
      gates: [{ id: 'bw.gate_t', minProfile: 'medium', x: 1, y: 1, w: 2, h: 1 }],
    };
    expect(pickAt(withGate, 2, 1)).toEqual({ kind: 'gates', id: 'bw.gate_t' });
  });

  it('places a giver from its template, and draws gates and paths with their own tools only', () => {
    const t = templatesFor('givers', woods.id).find((e) => e.label === 'collier')!;
    expect(t.fields).toMatchObject({ npc: 'collier', facing: 'n' });
    const spot = floorTile(woods);
    const next = ok(placeAny(woods, 'givers', 'new_giver', spot.x, spot.y, t.fields));
    expect(next.givers!.at(-1)).toMatchObject({ id: 'bw.new_giver', npc: 'collier', ...spot });
    expect(placeAny(woods, 'gates', 'g', spot.x, spot.y, {})).toHaveProperty('error');
    expect(duplicateAny(woods, { kind: 'paths', id: woods.paths[0]!.id }, 'again')).toHaveProperty('error');
  });

  it('deletes only a gate or path made in the session', () => {
    const frozen = woods.paths[0]!.id;
    expect(removeAny(woods, { kind: 'paths', id: frozen }, woods, [])).toHaveProperty('error');
    const made: Scene = {
      ...woods,
      gates: [{ id: 'bw.gate_t', minProfile: 'medium', x: 1, y: 1, w: 1, h: 1 }],
    };
    expect(ok(removeAny(made, { kind: 'gates', id: 'bw.gate_t' }, woods, [])).gates).toHaveLength(0);
  });

  it('moves a selected path through the session and undoes it', () => {
    const s = new EditorSession('bp_woods');
    const path = s.scene.paths[0]!;
    s.select({ kind: 'paths', id: path.id });
    s.moveSelected(path.points[0]!.x + 1, path.points[0]!.y);
    expect(s.scene.paths[0]!.points[0]!.x).toBe(path.points[0]!.x + 1);
    s.undo();
    expect(s.scene.paths[0]).toEqual(path);
  });
});
