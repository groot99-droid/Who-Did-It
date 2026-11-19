import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readRenderMode } from '../flags';
import { THREE_GZIP_MAX, threeChunkProblem } from './chunkBudget';

const SRC = fileURLToPath(new URL('..', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'world3' ? [] : sources(p);
    return /\.ts$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
  });
}

describe('the sprite world flag (round 11, R1; A618)', () => {
  it('is on only for ?render=sprite', () => {
    expect(readRenderMode('')).toBe('phaser');
    expect(readRenderMode('?render=sprite')).toBe('sprite');
    expect(readRenderMode('?mock=1&render=sprite')).toBe('sprite');
    expect(readRenderMode('?render=phaser')).toBe('phaser');
    expect(readRenderMode('?render=3d')).toBe('phaser');
  });

  it('a default load does not import world3/ or three: one dynamic import, and types', () => {
    const found: string[] = [];
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const line of text.split('\n')) {
        if (!/world3|from 'three'/.test(line) || /^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        if (/^import type .* from '\.\.\/world3';/.test(line)) continue;
        if (/^\s*(void )?import\('\.\.\/world3'\)/.test(line)) {
          found.push(relative(SRC, file));
          continue;
        }
        if (/^import\b/.test(line) || /\bfrom '/.test(line))
          throw new Error(`${relative(SRC, file)}: ${line}`);
      }
    }
    expect(found).toEqual(['scenes/World.ts']);
  });
});

describe('the three chunk budget (A618)', () => {
  const chunk = (fileName: string, name: string, isEntry: boolean, imports: string[] = []) => ({
    fileName,
    name,
    isEntry,
    imports,
  });

  it('passes a three chunk under the cap that only a dynamic import reaches', () => {
    const chunks = [
      chunk('index.js', 'index', true, ['phaser.js']),
      chunk('phaser.js', 'phaser', false),
      chunk('three.js', 'three', false),
    ];
    expect(threeChunkProblem(chunks, () => THREE_GZIP_MAX)).toBeNull();
  });

  it('fails a missing chunk, one over the cap, and one the default load imports', () => {
    expect(threeChunkProblem([chunk('index.js', 'index', true)], () => 0)).toMatch(/no `three` chunk/);
    const ok = [chunk('index.js', 'index', true), chunk('three.js', 'three', false)];
    expect(threeChunkProblem(ok, () => THREE_GZIP_MAX + 1)).toMatch(/over the/);
    const eager = [
      chunk('index.js', 'index', true, ['w.js']),
      chunk('w.js', 'w', false, ['three.js']),
      chunk('three.js', 'three', false),
    ];
    expect(threeChunkProblem(eager, () => 1)).toMatch(/default load/);
  });
});
