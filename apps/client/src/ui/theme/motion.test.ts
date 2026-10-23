import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Round 8 (8H, docs/UI.md 9): the interface's motion reads tokens only, and every duration or distance token
// has its zero under prefers-reduced-motion, so a rule written against the tokens needs no reduced twin.

const THEME = import.meta.dirname;
const tokens = readFileSync(join(THEME, 'tokens.css'), 'utf8');
const components = readFileSync(join(THEME, 'components.css'), 'utf8');

const REDUCED = /@media \(prefers-reduced-motion: reduce\) \{\s*:root \{([^}]*)\}/;
const reducedBlock = REDUCED.exec(tokens)?.[1] ?? '';
const rootBlock = tokens.slice(tokens.indexOf(':root {'), tokens.search(REDUCED));

/** `--name: value` pairs of a block. */
const decls = (block: string) =>
  new Map([...block.matchAll(/(--wdi-[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
const root = decls(rootBlock);
const reduced = decls(reducedBlock);

/** The motion tokens that move or take time: durations, the stagger and the travel distances. */
const MOVING = /^--wdi-(dur-[a-z-]+|stagger|lift|press|press-scale|nudge|rise|shake)$/;

/** The Round 8 (8H) block of components.css, up to the next block's banner or the end of the file. */
function block8h(): string {
  const start = components.indexOf('Round 8 (8H)');
  const rest = components.slice(start);
  const next = rest.slice(1).search(/\/\* -{20,} Round \d/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

describe('motion tokens (UI.md 9)', () => {
  const moving = [...root.keys()].filter((k) => MOVING.test(k));

  it('finds the round-8 tokens and the reduced-motion block', () => {
    expect(moving).toEqual(expect.arrayContaining(['--wdi-dur-fast', '--wdi-dur-panel', '--wdi-stagger']));
    expect(reduced.size).toBeGreaterThan(0);
  });

  it.each(moving)('%s is zeroed under reduced motion', (name) => {
    const zero = name === '--wdi-press-scale' ? '1' : /\dm?s$/.test(root.get(name)!) ? '0ms' : '0px';
    expect(reduced.get(name)).toBe(zero);
  });

  it('zeroes nothing that is not a motion token', () => {
    for (const name of reduced.keys()) expect(name).toMatch(MOVING);
  });
});

describe('the Round 8 (8H) block of components.css', () => {
  const css = block8h();

  it('exists', () => expect(css.length).toBeGreaterThan(200));

  it('names only tokens that tokens.css declares', () => {
    const used = new Set([...css.matchAll(/var\((--wdi-[a-z0-9-]+)/g)].map((m) => m[1]!));
    for (const name of used) expect(root.has(name), name).toBe(true);
  });

  it('writes no literal duration: every time is a token', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body.match(/\b\d+(\.\d+)?m?s\b/g) ?? []).toEqual([]);
  });

  it('moves through translate and scale, never transform', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body).not.toMatch(/(^|[\s;{])transform\s*:/m);
  });
});
