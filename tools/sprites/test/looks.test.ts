import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIRECTIONS, V1_CLIPS, frameCounts, lookTails, type Anim } from '../keys.ts';
import type { MultiAtlas } from '../pack.ts';
import { artStyles } from '../palette.ts';
import { villagerLooks, worldLooks } from '../placeholder-chars.ts';
import { ASSETS } from './realAssets.ts';

/**
 * Art plan 4.3 and SPRITES 3: one character per world look and per townsfolk variant, three passes on shared pivots;
 * a real look's resident clips on `char_<look>` and `ovl_<look>`, its lazy clips on the `_2` pair (A161), the
 * placeholder looks the V1 five.
 */
const SPEC = join(import.meta.dirname, '../../blender/looks_spec.py');

/** The look ids of looks_spec.py's LOOKS dict (its keys sit at four spaces of indent). */
function specLooks(): string[] {
  const src = readFileSync(SPEC, 'utf8');
  const body = src.slice(src.indexOf('LOOKS: dict[str, dict] = {'), src.indexOf('\nWORLD_LOOKS'));
  return [...body.matchAll(/^ {4}"([a-z][a-z0-9]*)": \{/gm)].map((m) => m[1]!);
}

interface Entry {
  key: string;
  url: string;
  path?: string;
}
const manifestAt = (rel: string) =>
  (JSON.parse(readFileSync(join(ASSETS, rel), 'utf8')) as { entries: Entry[] }).entries;

function frames(base: string, entry: Entry) {
  const atlas = JSON.parse(readFileSync(join(base, entry.url), 'utf8')) as MultiAtlas;
  return new Map(atlas.textures.flatMap((t) => t.frames.map((f) => [f.filename, f] as const)));
}

const v1Tails = (look: string) =>
  (Object.keys(V1_CLIPS) as Anim[]).flatMap((anim) =>
    DIRECTIONS.flatMap((d) =>
      Array.from(
        { length: V1_CLIPS[anim].frames },
        (_, i) => `${look}/${anim}/${d}/${String(i).padStart(3, '0')}`,
      ),
    ),
  );

/** The body atlas and the overlay atlas of a pair hold exactly `tails`, three passes on one pivot per frame. */
function expectPair(base: string, body: Entry, ovl: Entry, tails: string[]) {
  const b = frames(base, body);
  const o = frames(base, ovl);
  expect([...b.keys()].sort()).toEqual(tails.map((t) => `char/${t}`));
  for (const pass of ['scarf', 'blood']) {
    const got = [...o.keys()].filter((k) => k.startsWith(`${pass}/`)).sort();
    expect(got, pass).toEqual(tails.map((t) => `${pass}/${t}`));
  }
  for (const t of tails) {
    const pivot = b.get(`char/${t}`)!.pivot;
    expect(pivot, t).toBeDefined();
    expect(o.get(`scarf/${t}`)!.pivot, t).toEqual(pivot);
    expect(o.get(`blood/${t}`)!.pivot, t).toEqual(pivot);
  }
}

describe('the world looks (art plan 4.3, looks.json)', () => {
  const looks = worldLooks().map((l) => l.id);
  const family = villagerLooks().map((l) => l.id);

  it('builds exactly the looks.json looks with a body, plus the villager family', () => {
    expect(specLooks().sort()).toEqual([...looks, ...family].sort());
  });

  // The deck looks in both manifests; the family (round 8, A161) in every real style's, the placeholder's keeps the
  // plain villager only (manifest.test.ts). A real look carries the clip table, the placeholder figures the V1 five.
  const sets: Array<[string, string, string, string[], boolean]> = [
    ...artStyles().map((s): [string, string, string, string[], boolean] => [
      s.id,
      join(s.root, 'manifest.json'),
      join(ASSETS, s.root),
      s.root === '' ? [...looks, ...family] : family,
      true,
    ]),
    ['placeholder', 'placeholder/manifest.json', join(ASSETS, 'placeholder'), looks, false],
  ];
  for (const [label, rel, base, ids, real] of sets) {
    const entries = new Map(manifestAt(rel).map((e) => [e.key, e]));
    for (const look of ids) {
      const { resident, lazy } = frameCounts(look);
      it(`${label}: char_${look} and ovl_${look} hold the ${real ? `${resident} resident` : '272 V1'} frames, three passes on one pivot`, () => {
        const body = entries.get(`char_${look}`);
        const ovl = entries.get(`ovl_${look}`);
        expect(body && ovl && entries.has(`anims_${look}`)).toBeTruthy();
        const tails = (real ? lookTails(look, false) : v1Tails(look)).sort();
        expect(tails).toHaveLength(real ? resident : 272);
        expectPair(base, body!, ovl!, tails);
      });
      if (!real) continue;
      it(`${label}: char_${look}_2 and ovl_${look}_2 hold the ${lazy} lazy frames, loaded with no map`, () => {
        const body = entries.get(`char_${look}_2`);
        const ovl = entries.get(`ovl_${look}_2`);
        const anims = entries.get(`anims_${look}_2`);
        expect(body && ovl && anims).toBeTruthy();
        for (const e of [body!, ovl!, anims!]) expect((e as { maps?: string[] }).maps, e.key).toEqual([]);
        const tails = lookTails(look, true).sort();
        expect(tails).toHaveLength(lazy);
        expectPair(base, body!, ovl!, tails);
      });
    }
  }
});
