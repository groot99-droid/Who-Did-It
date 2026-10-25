import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SaveRefused, checkSave, diffSummary, formatDataJson } from '../src/services/studioSave';

const DIR = fileURLToPath(new URL('../../../packages/content/data/scenes', import.meta.url));
/** A fresh copy of a committed scene file, as the editor sends it. */
type RawScene = Record<string, unknown> & {
  grid: string[];
  material: string[];
  portals: Array<Record<string, unknown> & { id: string }>;
  spawns: Array<{ id: string }>;
};
const raw = (id: string): RawScene => JSON.parse(readFileSync(join(DIR, `${id}.json`), 'utf8'));

/** The problems of a refused save. */
function refused(scene: unknown): string[] {
  try {
    checkSave(scene);
  } catch (e) {
    if (e instanceof SaveRefused) return e.problems;
    throw e;
  }
  throw new Error('the save was accepted');
}

const put = (row: string, x: number, ch: string): string => row.slice(0, x) + ch + row.slice(x + 1);
/** The bakery with one floor tile by the east wall made a wall, with a wall material (row 6, column 16). */
const walledBakery = () => {
  const s = raw('bakery');
  s.grid[6] = put(s.grid[6]!, 16, '#');
  s.material[6] = put(s.material[6]!, 16, 'W');
  return s;
};

describe('the Studio save checks', () => {
  it('writes the content layout byte for byte: every committed scene and nav', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(50);
    for (const f of files) {
      const text = readFileSync(join(DIR, f), 'utf8');
      expect(formatDataJson(JSON.parse(text)), f).toBe(text);
    }
  });

  it('accepts an edited grid, regenerates the nav and keeps the file layout and key order', () => {
    const save = checkSave(walledBakery());
    expect(save.nav.solid[6]).toBe('1' + '0'.repeat(15) + '11');
    expect(save.summary).toEqual(['- grid: 1 row changed', '- material changed']);
    const committed = readFileSync(join(DIR, 'bakery.json'), 'utf8').split('\n');
    const written = save.sceneText.split('\n');
    expect(written.length).toBe(committed.length);
    expect(written.filter((line, i) => line !== committed[i])).toHaveLength(2);
    expect(save.navText).toBe(formatDataJson(save.nav));
  });

  it('refuses an unknown scene, a schema error and an unchanged scene', () => {
    expect(refused({ ...raw('bakery'), id: 'atlantis' })[0]).toMatch(/^unknown scene/);
    expect(refused(null)[0]).toMatch(/^unknown scene/);
    const bad = raw('bakery');
    bad.grid[2] = 'Z' + bad.grid[2]!.slice(1);
    expect(refused(bad)).toEqual(['grid.2: grid rows use only # D S H B .']);
    expect(refused({ ...raw('bakery'), extra: 1 })[0]).toMatch(/extra/);
    expect(refused(raw('bakery'))).toEqual(['nothing changed']);
  });

  it('refuses a scene the content validator rejects: a door to a scene that does not exist', () => {
    const s = raw('bakery') as Record<string, unknown> & { portals: Array<Record<string, unknown>> };
    s.portals[0] = { ...s.portals[0], to: 'nowhere' };
    expect(refused(s).length).toBeGreaterThan(0);
  });

  it('refuses a frozen-id rename and a new prefix', () => {
    const s = raw('bakery');
    s.portals[0] = { ...s.portals[0]!, id: 'bk.front_door' };
    expect(refused(s)).toContain('frozen id removed or renamed: portals bk.door');
    const t = raw('bakery');
    t.spawns = t.spawns.filter((sp) => sp.id !== 'cold_room');
    expect(refused(t)).toContain('frozen id removed or renamed: spawns cold_room');
    expect(refused({ ...raw('bakery'), prefix: 'zz' })).toContain('prefix is frozen: bk');
  });

  it('summarises added, removed and changed ids and other fields', () => {
    const before = checkSave(walledBakery()).scene;
    const after = {
      ...before,
      notes: 'edited',
      props: [...before.props.slice(1), { ...before.props[1]!, id: 'bk.new_stool' }],
    };
    expect(diffSummary(before, after)).toEqual([
      '- props: added `bk.new_stool`; removed `bk.wake_table`',
      '- fields: `notes`',
    ]);
  });
});
