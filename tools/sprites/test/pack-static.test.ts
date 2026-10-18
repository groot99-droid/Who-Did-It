import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { CLUE_KEYS, VFX_CLIPS, staticFrameNames } from '../keys.ts';
import {
  MAP_PROPS_FRAMES,
  PROPS_FRAMES,
  clueFrameNames,
  expectedFrames,
  packStatic,
  staticAnims,
  type StaticManifest,
} from '../pack-static.ts';
import type { MultiAtlas, PackInput } from '../pack.ts';
import { clueFrames } from '../placeholder-world.ts';

/** A transparent cell with one block whose bottom centre sits on `base`. */
function cell(size: number, base: [number, number], shade: string): Buffer {
  const c = createCanvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = shade;
  g.fillRect(base[0] - 10, base[1] - 30, 20, 30);
  return c.toBuffer('image/png');
}

function sheet(atlas: 'clues' | 'props' | 'vfx', size: number, pivot: boolean) {
  const manifest: StaticManifest = { version: 1, atlas, frames: {} };
  const inputs: PackInput[] = expectedFrames(atlas).map((name, i) => {
    const base: [number, number] = [size / 2 + (i % 5), size - 20];
    manifest.frames[name] = { file: `${name}.png`, cell: size, ...(pivot ? { pivot: base } : {}) };
    return { name, png: cell(size, base, i % 2 ? '#B3121F' : '#6F7A8C') };
  });
  return { manifest, inputs };
}

const atlasOf = (files: Map<string, Buffer>, key: string) =>
  JSON.parse(files.get(`${key}.json`)!.toString('utf8')) as MultiAtlas;

describe('static keys', () => {
  it('lists the SPRITES 8 clue keys and the glow triple, matching the placeholder clues', () => {
    expect(CLUE_KEYS).toHaveLength(21);
    expect(clueFrameNames()).toHaveLength(24);
    expect(clueFrameNames()).toEqual(expect.arrayContaining([...CLUE_KEYS, 'clue_footprint_m_glow']));
    expect(clueFrameNames()).toEqual(
      clueFrames()
        .map((f) => f.name)
        .sort(),
    );
    expect(PROPS_FRAMES).toContain('prop_lanternPost_lit');
    expect(PROPS_FRAMES.filter((f) => f.startsWith('portal_'))).toHaveLength(20);
    expect(MAP_PROPS_FRAMES.props_hollowmere).toEqual(
      expect.arrayContaining(['prop_plate', 'prop_deadLoaf', 'prop_flour_sacks', 'prop_bell']),
    );
    expect(new Set(PROPS_FRAMES).size).toBe(PROPS_FRAMES.length);
    expect(staticFrameNames('vfx')).toHaveLength(Object.values(VFX_CLIPS).reduce((a, b) => a + b, 0));
    expect(staticFrameNames('vfx')).toContain('vfx_vote_stamp/009');
  });
});

describe('packStatic', () => {
  it('writes props pivots at the base, from the untrimmed cell', async () => {
    const { manifest, inputs } = sheet('props', 192, true);
    const files = await packStatic(manifest, inputs);
    expect([...files.keys()].sort()).toEqual(['props-0.png', 'props.json']);
    const frames = atlasOf(files, 'props').textures.flatMap((t) => t.frames);
    expect(frames.map((f) => f.filename)).toEqual([...PROPS_FRAMES].sort());
    for (const f of frames) {
      const want = manifest.frames[f.filename]!.pivot!;
      expect(f.trimmed).toBe(true);
      expect(f.sourceSize).toEqual({ w: 192, h: 192 });
      expect(f.pivot!.x).toBeCloseTo(want[0] / 192, 4);
      expect(f.pivot!.y).toBeCloseTo(want[1] / 192, 4);
    }
  });

  it('leaves clue frames centred and is deterministic', async () => {
    const a = sheet('clues', 64, false);
    const one = await packStatic(a.manifest, a.inputs);
    const two = await packStatic(a.manifest, [...a.inputs].reverse());
    expect(one.get('clues-0.png')!.equals(two.get('clues-0.png')!)).toBe(true);
    expect(one.get('clues.json')!.equals(two.get('clues.json')!)).toBe(true);
    for (const f of atlasOf(one, 'clues').textures.flatMap((t) => t.frames)) expect(f.pivot).toBeUndefined();
  });

  it('builds one once-only 12 fps anim per vfx clip', async () => {
    const { manifest, inputs } = sheet('vfx', 128, true);
    const files = await packStatic(manifest, inputs);
    const { anims } = JSON.parse(files.get('vfx.anims.json')!.toString('utf8')) as ReturnType<
      typeof staticAnims
    >;
    expect(anims.map((a) => a.key)).toEqual(Object.keys(VFX_CLIPS).sort());
    for (const a of anims) {
      expect(a.frames).toHaveLength(VFX_CLIPS[a.key]!);
      expect(a.frameRate).toBe(12);
      expect(a.repeat).toBe(0);
      expect(a.frames[0]).toEqual({ key: 'vfx', frame: `${a.key}/000` });
    }
  });

  it('refuses a render that misses or adds a key', async () => {
    const { manifest, inputs } = sheet('props', 192, true);
    const noPump = inputs.filter((i) => i.name !== 'prop_pump');
    await expect(packStatic(manifest, noPump)).rejects.toThrow(/missing \[prop_pump\]/);
    const extra = [...inputs, { name: 'prop_cart', png: inputs[0]!.png }];
    await expect(packStatic(manifest, extra)).rejects.toThrow(/unexpected \[prop_cart\]/);
  });
});
