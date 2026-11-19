import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_RENDERS } from './renderLegacy.ts';

/**
 * Round 11, T5 (ASSETS 6.6): every atlas an art drop ships has a render lock (tools/blender/render_lock.py, T4) whose
 * frames equal the atlas's. The committed locks are `assets/source/renders/<unit>.lock.json`. A render unit is what one
 * render run wrote: a figure's `char_<look>`, `char_<look>_2` and `ovl_<look>*` pages are one unit, `<look>`; any other
 * atlas is its own file name (`props_hollowmere`, `vfx`, `iso_kit_harbour`). A unit not yet re-rendered with the
 * writer is in LEGACY_RENDERS, which only shrinks: adding its lock is what deletes its line.
 */
const ROOT = join(import.meta.dirname, '../../..');
const ASSETS = join(ROOT, 'apps/client/public/assets');
const LOCKS = join(ROOT, 'assets/source/renders');
const ATLAS_DIRS = ['chars', 'props', 'clues', 'vfx', 'kit', 'buildings'];

interface Texture {
  frames: Array<{ filename: string }>;
}

/** The unit an atlas file belongs to. */
export const unitOf = (file: string): string => {
  const m = /^(?:char|ovl)_(.+?)(?:_2)?$/.exec(file);
  return m?.[1] ?? file;
};

/** An atlas frame name as the render lock spells it (a figure's `look/anim/dir/n` is `char_look_anim_dir_n`). */
export const lockKey = (file: string, frame: string): string => {
  const base = frame.split('#')[0] ?? frame; // a building's slices share their art's name
  if (file.startsWith('char_')) return base.replace(/\//g, '_');
  if (file.startsWith('ovl_')) {
    const [pass, ...rest] = base.split('/');
    return `${pass}/char_${rest.join('_')}`;
  }
  return base;
};

/** unit -> the lock keys of every frame the shipped atlases of that unit hold. */
export function shippedUnits(assets: string): Map<string, Set<string>> {
  const units = new Map<string, Set<string>>();
  for (const dir of ATLAS_DIRS) {
    const path = join(assets, dir);
    if (!existsSync(path)) continue;
    for (const f of readdirSync(path).filter((n) => n.endsWith('.json') && !n.endsWith('.anims.json'))) {
      const atlas = JSON.parse(readFileSync(join(path, f), 'utf8')) as { textures?: Texture[] };
      if (!atlas.textures) continue;
      const file = f.slice(0, -'.json'.length);
      const keys = units.get(unitOf(file)) ?? new Set<string>();
      for (const t of atlas.textures) for (const fr of t.frames) keys.add(lockKey(file, fr.filename));
      units.set(unitOf(file), keys);
    }
  }
  return units;
}

/** What is wrong between a lock and its unit's frames, as readable lines (empty when they are equal). */
export function compare(unit: string, lockFrames: string[], atlasFrames: Set<string>): string[] {
  const lock = new Set(lockFrames);
  const missing = [...atlasFrames].filter((k) => !lock.has(k)).sort();
  const extra = [...lock].filter((k) => !atlasFrames.has(k)).sort();
  return [
    ...(missing.length
      ? [`${unit}: ${missing.length} shipped frames have no lock entry, e.g. ${missing[0]}`]
      : []),
    ...(extra.length ? [`${unit}: ${extra.length} lock entries are not shipped, e.g. ${extra[0]}`] : []),
  ];
}

const locksIn = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((n) => n.endsWith('.lock.json'))
        .map((n) => n.slice(0, -'.lock.json'.length))
    : [];

const readLock = (dir: string, unit: string) =>
  JSON.parse(readFileSync(join(dir, `${unit}.lock.json`), 'utf8')) as {
    version: number;
    frames: Record<string, string>;
  };

describe('the committed render locks', () => {
  const units = shippedUnits(ASSETS);
  const locks = locksIn(LOCKS);

  it('cover every shipped unit, except the LEGACY ones', () => {
    const missing = [...units.keys()].filter((u) => !locks.includes(u) && !LEGACY_RENDERS.includes(u));
    expect(missing).toEqual([]);
  });

  it('have a lock whose frames equal the atlas frames, hashes 64 hex digits', () => {
    for (const unit of locks) {
      expect(units.has(unit), `${unit}: a lock for an atlas nothing ships`).toBe(true);
      const lock = readLock(LOCKS, unit);
      expect(lock.version).toBe(1);
      expect(Object.values(lock.frames).every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
      expect(compare(unit, Object.keys(lock.frames), units.get(unit) ?? new Set())).toEqual([]);
    }
  });
});

describe('the LEGACY_RENDERS allowlist only shrinks', () => {
  it('has no duplicates and names only shipped units', () => {
    expect(new Set(LEGACY_RENDERS).size).toBe(LEGACY_RENDERS.length);
    expect(LEGACY_RENDERS.filter((u) => !shippedUnits(ASSETS).has(u))).toEqual([]);
  });

  it('drops a unit the moment its lock is committed', () => {
    expect(LEGACY_RENDERS.filter((u) => locksIn(LOCKS).includes(u))).toEqual([]);
  });
});

describe('the comparison', () => {
  const frame = (name: string) => ({ filename: name });
  const atlas = (dir: string, file: string, frames: string[]) => {
    mkdirSync(join(dir, 'chars'), { recursive: true });
    writeFileSync(
      join(dir, 'chars', `${file}.json`),
      JSON.stringify({ textures: [{ frames: frames.map(frame) }] }),
    );
  };

  it('reads a figure across its pages and overlay as one unit with the lock keys of the writer', () => {
    const dir = mkdtempSync(join(tmpdir(), 'renders-'));
    atlas(dir, 'char_baker', ['char/baker/idle/n/000']);
    atlas(dir, 'char_baker_2', ['char/baker/limp/ne/000']);
    atlas(dir, 'ovl_baker', ['blood/baker/idle/n/000']);
    mkdirSync(join(dir, 'buildings'));
    writeFileSync(
      join(dir, 'buildings', 'bld_x.json'),
      JSON.stringify({ textures: [{ frames: [frame('apoth#0_0'), frame('apoth#0_1')] }] }),
    );
    const units = shippedUnits(dir);
    expect([...units.keys()].sort()).toEqual(['baker', 'bld_x']);
    expect([...(units.get('baker') ?? [])].sort()).toEqual([
      'blood/char_baker_idle_n_000',
      'char_baker_idle_n_000',
      'char_baker_limp_ne_000',
    ]);
    expect([...(units.get('bld_x') ?? [])]).toEqual(['apoth']);
  });

  it('accepts equal frames, names a missing one and an extra one', () => {
    const shipped = new Set(['a', 'b']);
    expect(compare('u', ['b', 'a'], shipped)).toEqual([]);
    expect(compare('u', ['a'], shipped)).toEqual(['u: 1 shipped frames have no lock entry, e.g. b']);
    expect(compare('u', ['a', 'b', 'c'], shipped)).toEqual(['u: 1 lock entries are not shipped, e.g. c']);
  });
});
