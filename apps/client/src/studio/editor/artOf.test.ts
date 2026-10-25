import { describe, expect, it } from 'vitest';
import { scenes, type Scene } from '@wdi/content';
import { staticsOfScene, tilemapOf } from './artOf';
import { move, remove } from './sceneEdit';

const base = scenes.bakery as Scene;
const ok = (e: { scene: Scene } | { error: string }): Scene => {
  if ('error' in e) throw new Error(e.error);
  return e.scene;
};
/** Every frame exists, so props draw their art and not a greybox. */
const ctx = { hasFrame: () => true };
const table = { kind: 'props', id: 'bk.wake_table' } as const;

describe('staticsOfScene', () => {
  it('draws the same sprites as the committed scene for an untouched scene', () => {
    expect(staticsOfScene(structuredClone(base), ctx)).toEqual(staticsOfScene(base, ctx));
  });

  it('moves a prop sprite when the prop moves', () => {
    const before = staticsOfScene(base, ctx);
    const after = staticsOfScene(ok(move(base, table, 9, 5)), ctx);
    const was = before.filter((d) => d.id.startsWith('bk.wake_table'));
    const now = after.filter((d) => d.id.startsWith('bk.wake_table'));
    expect(was.length).toBeGreaterThan(0);
    expect(now).toHaveLength(was.length);
    expect(now.map((d) => d.x)).not.toEqual(was.map((d) => d.x));
  });

  it('drops a prop sprite when the prop is deleted', () => {
    const gone = ok(remove(base, table, { ...base, props: base.props.filter((p) => p.id !== table.id) }, []));
    expect(staticsOfScene(base, ctx).some((d) => d.id.startsWith('bk.wake_table'))).toBe(true);
    expect(staticsOfScene(gone, ctx).some((d) => d.id.startsWith('bk.wake_table'))).toBe(false);
  });

  it('builds the tilemap from the edited grid', () => {
    const painted = { ...base, grid: base.grid.map((r, y) => (y === 1 ? '#'.repeat(r.length) : r)) };
    expect(JSON.stringify(tilemapOf(painted))).not.toBe(JSON.stringify(tilemapOf(base)));
  });
});
