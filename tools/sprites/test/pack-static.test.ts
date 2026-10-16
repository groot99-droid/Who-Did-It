import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { CLUE_KEYS, PROP_KEYS, VFX_CLIPS, staticFrameNames } from '../keys.ts';
import { packStatic, staticAnims, type StaticManifest } from '../pack-static.ts';
import type { MultiAtlas, PackInput } from '../pack.ts';
import { clueFrames } from '../placeholder.ts';

/** A transparent cell with one block whose bottom centre sits on `base`. */
function cell(size: number, base: [number, number], shade: string): Buffer {
  const c = createCanvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = shade;
  g.fillRect(base[0] - 10, base[1] - 30, 20, 30);
  return c.toBuffer('image/png');
}

function sheet(atlas: StaticManifest['atlas'], size: number, pivot: boolean) {
  const manifest: StaticManifest = { version: 1, atlas, frames: {} };
  const inputs: PackInput[] = staticFrameNames(atlas).map((name, i) => {
    const base: [number, number] = [size / 2 + (i % 5), size - 20];
    manifest.frames[name] = { file: `${name}.png`, cell: size, ...(pivot ? { pivot: base } : {}) };
    return { name, png: cell(size, base, i % 2 ? '#B3121F' : '#6F7A8C') };
  });
  return { manifest, inputs };
}

const atlasOf = (files: Map<string, Buffer>, key: string) =>
  JSON.parse(files.get(`${key}.json`)!.toString('utf8')) as MultiAtlas;

describe('static keys', () => {
  it('lists the SPRITES 8 keys, matching the placeholder clues', () => {
    expect(CLUE_KEYS).toHaveLength(21);
    expect(new Set(CLUE_KEYS).size).toBe(21);
    expect([...CLUE_KEYS].sort()).toEqual(clueFrames().map((f) => f.name).sort());
    expect(PROP_KEYS).toContain('prop_lanternPost_lit');
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
    expect(frames.map((f) => f.filename)).toEqual([...PROP_KEYS].sort());
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
    const { anims } = JSON.parse(files.get('vfx.anims.json')!.toString('utf8')) as ReturnType<typeof staticAnims>;
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
    await expect(packStatic(manifest, inputs.slice(1))).rejects.toThrow(/missing \[prop_bell\]/);
    const extra = [...inputs, { name: 'prop_cart', png: inputs[0]!.png }];
    await expect(packStatic(manifest, extra)).rejects.toThrow(/unexpected \[prop_cart\]/);
  });
});
