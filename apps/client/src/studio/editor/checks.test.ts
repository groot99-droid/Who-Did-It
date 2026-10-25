import { describe, expect, it } from 'vitest';
import { scenes, type Scene } from '@wdi/content';
import { checkScene } from './checks';
import { paint } from './gridEdit';
import { EditorSession } from './session';

const all = scenes as unknown as Record<string, Scene>;
const id = Object.keys(all)[0]!;

describe('live checks', () => {
  it('passes every committed scene as it is', () => {
    for (const s of Object.values(all)) expect(checkScene(structuredClone(s)).errors).toEqual([]);
  });

  it('reports a schema problem and stops there', () => {
    const bad = { ...structuredClone(all[id]!), prefix: 'x' } as Scene;
    const c = checkScene(bad);
    expect(c.errors.length).toBeGreaterThan(0);
    expect(c.warnings).toEqual([]);
  });

  it('refuses to paint a portal door tile into a wall without an error', () => {
    const s = structuredClone(all[id]!);
    const door = s.portals[0]!;
    const e = paint(s, [{ x: door.x, y: door.y }], '#');
    if ('error' in e) throw new Error(e.error);
    expect(checkScene(e.scene).errors.join('\n')).toContain(door.id);
  });

  it('warns about a door sealed off from the first spawn', () => {
    const s = structuredClone(all[id]!);
    const spawn = s.spawns[0]!;
    const around = [
      { x: spawn.x + 1, y: spawn.y },
      { x: spawn.x - 1, y: spawn.y },
      { x: spawn.x, y: spawn.y + 1 },
      { x: spawn.x, y: spawn.y - 1 },
    ].filter((t) => s.grid[t.y]?.[t.x] === '.');
    const e = paint(s, around, '#');
    if ('error' in e) throw new Error(e.error);
    expect(checkScene(e.scene).warnings.length).toBeGreaterThan(0);
  });

  it('is cached per edit in the session', () => {
    const e = new EditorSession(id);
    expect(e.checks).toBe(e.checks);
    const before = e.checks;
    e.setCell('#');
    e.paintTiles([{ x: 0, y: 0 }]);
    expect(e.checks).not.toBe(before);
  });
});
